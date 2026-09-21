-- A lifetime allocation per cooperative. Existing cards remain valid.
-- Internal allowance changes require a trusted database administrator.
LOCK TABLE public.member_cards IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE private.cooperative_card_allowances (
  cooperative_id uuid PRIMARY KEY REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  card_limit integer NOT NULL DEFAULT 10 CHECK (card_limit >= 0),
  cards_issued integer NOT NULL DEFAULT 0 CHECK (cards_issued >= 0),
  adjustment_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.cooperative_card_allowances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cooperative_card_allowances FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON private.cooperative_card_allowances TO service_role;
INSERT INTO private.cooperative_card_allowances(cooperative_id,cards_issued)
SELECT cooperative_id,count(*) FROM public.member_cards
WHERE cooperative_id IS NOT NULL GROUP BY cooperative_id;

-- A conditional counter UPDATE serializes simultaneous issuances. It rolls back
-- with the card INSERT, and deletion/revocation never replenishes the allocation.
-- This definer trigger cannot be called as an API. Existing card RLS still applies.
CREATE FUNCTION private.enforce_cooperative_card_allowance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cooperative_id IS DISTINCT FROM OLD.cooperative_id
      OR NEW.member_id IS DISTINCT FROM OLD.member_id
      OR NEW.card_number IS DISTINCT FROM OLD.card_number
      OR NEW.card_type IS DISTINCT FROM OLD.card_type THEN
      RAISE EXCEPTION USING ERRCODE='P0011', MESSAGE='L''identité et l''organisation d''une carte émise ne peuvent pas être modifiées.';
    END IF;
    RETURN NEW;
  END IF;
  -- Independent Haroo identities have no cooperative; this is the Starter quota.
  IF NEW.cooperative_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO private.cooperative_card_allowances(cooperative_id)
    VALUES(NEW.cooperative_id) ON CONFLICT(cooperative_id) DO NOTHING;
  UPDATE private.cooperative_card_allowances
    SET cards_issued=cards_issued+1, updated_at=now()
    WHERE cooperative_id=NEW.cooperative_id AND cards_issued<card_limit;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0010', MESSAGE='Quota de cartes atteint. L''offre gratuite comprend 10 cartes numériques par coopérative. Contactez FaîtiereHub pour augmenter votre quota.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_cooperative_card_allowance() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER enforce_cooperative_card_allowance
BEFORE INSERT OR UPDATE ON public.member_cards
FOR EACH ROW EXECUTE FUNCTION private.enforce_cooperative_card_allowance();
