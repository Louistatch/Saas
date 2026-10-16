-- HarooLife : notifications sur le téléphone, hors du jeu, pour deux événements réels :
--   - de l'argent du jeu reçu d'un autre joueur (haroolife_money_transfers) ;
--   - un ami arrivé par le lien d'invitation (haroolife_referrals).
-- Les alertes vont dans une file lue seulement par le serveur (clé service_role) et expédiée une
-- seule fois par /api/push/dispatch, aux seuls appareils du destinataire qui ont activé les
-- alertes. Le champ mûr n'en fait pas partie : le temps du jeu n'avance que pendant la partie,
-- c'est le jeu lui-même qui prévient.
-- Dépend de 20261015_150000_haroolife_money.sql et 20261017_130000_haroolife_invites.sql.
-- Additif : une table, deux fonctions et deux déclencheurs nouveaux ; aucune ligne existante
-- n'est modifiée.
-- Retour arrière : supabase/rollbacks/20261017_140000_haroolife_push.rollback.sql

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.haroolife_push (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('money', 'invite')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);
CREATE INDEX haroolife_push_pending ON public.haroolife_push(id) WHERE dispatched_at IS NULL;
ALTER TABLE public.haroolife_push ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_push FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_push TO service_role;

-- « 12 500 » : les milliers séparés par une espace.
CREATE OR REPLACE FUNCTION private.haroolife_fcfa(n integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(n::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g') || ' FCFA'
$$;
REVOKE ALL ON FUNCTION private.haroolife_fcfa(integer) FROM PUBLIC, anon, authenticated;

-- 1. Argent reçu : « Ama t'a envoyé 2 000 FCFA ».
CREATE OR REPLACE FUNCTION private.haroolife_push_money()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sender text;
BEGIN
  sender := coalesce((SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = NEW.sender_id), 'Un habitant');
  INSERT INTO public.haroolife_push(recipient_id, kind, title, body)
  VALUES (
    NEW.recipient_id, 'money',
    left(sender || ' t’a envoyé ' || private.haroolife_fcfa(NEW.amount), 120),
    left('Argent du jeu à encaisser dans HarooLife'
         || CASE WHEN NEW.note IS NOT NULL AND length(trim(NEW.note)) > 0 THEN ' : « ' || trim(NEW.note) || ' »' ELSE '.' END, 160)
  );
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.haroolife_push_money() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER haroolife_push_money
  AFTER INSERT ON public.haroolife_money_transfers
  FOR EACH ROW EXECUTE FUNCTION private.haroolife_push_money();

-- 2. Ami arrivé : « Kofi est arrivé par ton lien », avec son bonus quand il y en a un.
CREATE OR REPLACE FUNCTION private.haroolife_push_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE friend text;
BEGIN
  friend := coalesce((SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = NEW.invitee_id), 'Un ami');
  INSERT INTO public.haroolife_push(recipient_id, kind, title, body)
  VALUES (
    NEW.inviter_id, 'invite',
    left(friend || ' est arrivé par ton lien', 120),
    CASE WHEN NEW.inviter_bonus > 0
      THEN 'Ton bonus de ' || private.haroolife_fcfa(NEW.inviter_bonus) || ' de jeu t’attend dans HarooLife.'
      ELSE 'Merci de faire connaître HarooLife.' END
  );
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.haroolife_push_invite() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER haroolife_push_invite
  AFTER INSERT ON public.haroolife_referrals
  FOR EACH ROW EXECUTE FUNCTION private.haroolife_push_invite();
