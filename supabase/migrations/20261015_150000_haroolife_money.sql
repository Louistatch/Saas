-- HarooLife : envoyer de l'argent du jeu (FCFA fictifs, jamais d'argent réel) à un autre joueur.
-- Le portefeuille vit dans la sauvegarde locale de chaque joueur ; le transfert passe par la base :
--   - haroolife_money_send(clé, montant, mot, client_id) : l'envoyeur, habitant, désigne un autre
--     habitant par sa clé d'auteur (jamais son identifiant) ; idempotent par client_id ;
--     au plus 50 000 FCFA par envoi et 100 000 FCFA envoyés par 24 h ; refusé en cas de blocage ;
--   - haroolife_money_claim() : le destinataire encaisse, une seule fois, ce qu'on lui a envoyé.
-- Dépend de 20261015_130000_haroolife_chat_dm.sql (clés d'auteur, blocages).
-- Additif : aucune table, ligne ni fonction existante n'est modifiée.
-- Retour arrière : supabase/rollbacks/20261015_150000_haroolife_money.rollback.sql

CREATE TABLE public.haroolife_money_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 50000),
  note text CHECK (note IS NULL OR length(note) <= 80),
  client_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  UNIQUE (sender_id, client_id),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX haroolife_money_pending ON public.haroolife_money_transfers(recipient_id) WHERE claimed_at IS NULL;
CREATE INDEX haroolife_money_sent ON public.haroolife_money_transfers(sender_id, created_at DESC);
ALTER TABLE public.haroolife_money_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_money_transfers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_money_transfers TO service_role;

CREATE OR REPLACE FUNCTION public.haroolife_money_send(p_key text, p_amount integer, p_note text, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); other uuid; sent integer; t public.haroolife_money_transfers;
        v_note text := nullif(left(regexp_replace(trim(coalesce(p_note, '')), '\s+', ' ', 'g'), 80), '');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = actor) THEN
    RAISE EXCEPTION 'Choisis d’abord ta maison pour envoyer de l’argent' USING ERRCODE = '42501';
  END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Envoi invalide' USING ERRCODE = '22023'; END IF;
  -- Même envoi répété (coupure réseau) : le même transfert, sans double débit.
  SELECT * INTO t FROM public.haroolife_money_transfers WHERE sender_id = actor AND client_id = p_client_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', t.id, 'amount', t.amount, 'to', private.haroolife_peer_json(t.recipient_id), 'duplicate', true);
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 50000 THEN
    RAISE EXCEPTION 'Montant entre 1 et 50 000 FCFA' USING ERRCODE = '22023';
  END IF;
  other := private.haroolife_user_by_key(p_key);
  IF other IS NULL OR other = actor THEN RAISE EXCEPTION 'Joueur introuvable' USING ERRCODE = '42501'; END IF;
  IF private.haroolife_dm_blocked(actor, other) THEN
    RAISE EXCEPTION 'Envoi non autorisé' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(sum(amount), 0) INTO sent FROM public.haroolife_money_transfers
    WHERE sender_id = actor AND created_at > now() - interval '24 hours';
  IF sent + p_amount > 100000 THEN
    RAISE EXCEPTION 'Plafond atteint : 100 000 FCFA envoyés par jour' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.haroolife_money_transfers(sender_id, recipient_id, amount, note, client_id)
  VALUES (actor, other, p_amount, v_note, p_client_id) RETURNING * INTO t;
  RETURN jsonb_build_object('id', t.id, 'amount', t.amount, 'to', private.haroolife_peer_json(other), 'duplicate', false);
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_money_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); out jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  WITH claimed AS (
    UPDATE public.haroolife_money_transfers SET claimed_at = now()
    WHERE recipient_id = actor AND claimed_at IS NULL
    RETURNING id, sender_id, amount, note, created_at
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'amount', c.amount, 'note', c.note, 'at', c.created_at,
    'from', private.haroolife_peer_json(c.sender_id)
  ) ORDER BY c.created_at), '[]') INTO out FROM claimed c;
  RETURN out;
END $$;

REVOKE ALL ON FUNCTION public.haroolife_money_send(text, integer, text, uuid), public.haroolife_money_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_money_send(text, integer, text, uuid), public.haroolife_money_claim() TO authenticated;
