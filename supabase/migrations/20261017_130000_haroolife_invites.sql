-- HarooLife : inviter un ami. Chaque joueur a un code d'invitation (lien partagé par WhatsApp) ;
-- un nouveau joueur arrivé par ce lien reçoit un petit bonus d'argent du jeu, et celui qui l'a
-- invité aussi. Argent du jeu uniquement (FCFA fictifs).
--   - haroolife_invite_codes : un code par joueur (6 caractères, sans 0/O ni 1/I) ;
--   - haroolife_referrals : qui a invité qui (une seule fois par compte invité) ;
--   - haroolife_invite_code() : mon code, mes amis venus, mon bonus en attente ;
--   - haroolife_invite_accept(code) : l'invité, nouveau joueur (compte de moins de 7 jours) qui a
--     choisi sa maison, accepte l'invitation ; son bonus lui revient tout de suite ;
--   - haroolife_invite_claim() : l'inviteur reçoit les bonus des amis arrivés.
-- Contre la triche (s'inviter soi-même avec un compte jetable) : pas d'auto-invitation, une seule
-- invitation par compte, compte récent seulement, et au plus 5 bonus d'inviteur par 7 jours.
-- Additif : deux tables et trois fonctions nouvelles. Aucune ligne existante n'est touchée.
-- Retour arrière : supabase/rollbacks/20261017_130000_haroolife_invites.rollback.sql

CREATE TABLE public.haroolife_invite_codes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.haroolife_referrals (
  invitee_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_bonus integer NOT NULL CHECK (invitee_bonus BETWEEN 0 AND 10000),
  inviter_bonus integer NOT NULL CHECK (inviter_bonus BETWEEN 0 AND 10000),
  inviter_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (invitee_id <> inviter_id)
);
CREATE INDEX haroolife_referrals_inviter ON public.haroolife_referrals (inviter_id, created_at);
ALTER TABLE public.haroolife_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_invite_codes, public.haroolife_referrals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_invite_codes, public.haroolife_referrals TO service_role;

CREATE OR REPLACE FUNCTION public.haroolife_invite_code()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); c text; tries integer := 0;
        alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT code INTO c FROM public.haroolife_invite_codes WHERE user_id = actor;
  WHILE c IS NULL LOOP
    tries := tries + 1;
    IF tries > 20 THEN RAISE EXCEPTION 'Code indisponible, réessaie' USING ERRCODE = '22023'; END IF;
    c := (SELECT string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
          FROM generate_series(1, 6));
    BEGIN
      INSERT INTO public.haroolife_invite_codes(user_id, code) VALUES (actor, c);
    EXCEPTION WHEN unique_violation THEN
      SELECT code INTO c FROM public.haroolife_invite_codes WHERE user_id = actor;
    END;
  END LOOP;
  RETURN jsonb_build_object(
    'code', c,
    'friends', (SELECT count(*) FROM public.haroolife_referrals WHERE inviter_id = actor),
    'pending', (SELECT coalesce(sum(inviter_bonus), 0) FROM public.haroolife_referrals
                WHERE inviter_id = actor AND inviter_claimed_at IS NULL)
  );
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_invite_accept(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); inviter uuid; born timestamptz; recent integer;
        bonus constant integer := 2000; who text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.haroolife_referrals WHERE invitee_id = actor) THEN
    RETURN jsonb_build_object('ok', false, 'final', true, 'reason', 'Invitation déjà utilisée.');
  END IF;
  SELECT user_id INTO inviter FROM public.haroolife_invite_codes WHERE code = upper(trim(coalesce(p_code, '')));
  IF inviter IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'final', true, 'reason', 'Lien d’invitation inconnu.');
  END IF;
  IF inviter = actor THEN
    RETURN jsonb_build_object('ok', false, 'final', true, 'reason', 'On ne s’invite pas soi-même.');
  END IF;
  SELECT created_at INTO born FROM auth.users WHERE id = actor;
  IF born IS NULL OR born < now() - interval '7 days' THEN
    RETURN jsonb_build_object('ok', false, 'final', true,
                              'reason', 'Les invitations sont pour les nouveaux joueurs.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = actor) THEN
    RETURN jsonb_build_object('ok', false, 'final', false, 'reason', 'Choisis d’abord ta maison.');
  END IF;
  SELECT count(*) INTO recent FROM public.haroolife_referrals
    WHERE inviter_id = inviter AND inviter_bonus > 0 AND created_at > now() - interval '7 days';
  INSERT INTO public.haroolife_referrals(invitee_id, inviter_id, invitee_bonus, inviter_bonus)
  VALUES (actor, inviter, bonus, CASE WHEN recent < 5 THEN bonus ELSE 0 END)
  ON CONFLICT (invitee_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'final', true, 'reason', 'Invitation déjà utilisée.');
  END IF;
  SELECT display_name INTO who FROM public.haroolife_residents WHERE user_id = inviter;
  RETURN jsonb_build_object('ok', true, 'bonus', bonus, 'inviter', coalesce(who, 'Un ami'));
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_invite_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); total integer; names jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  WITH claimed AS (
    UPDATE public.haroolife_referrals SET inviter_claimed_at = now()
    WHERE inviter_id = actor AND inviter_claimed_at IS NULL AND inviter_bonus > 0
    RETURNING invitee_id, inviter_bonus
  )
  SELECT coalesce(sum(c.inviter_bonus), 0),
         coalesce(jsonb_agg(coalesce(r.display_name, 'Un ami')) FILTER (WHERE c.invitee_id IS NOT NULL), '[]')
    INTO total, names
  FROM claimed c LEFT JOIN public.haroolife_residents r ON r.user_id = c.invitee_id;
  RETURN jsonb_build_object('total', total, 'friends', names);
END $$;

REVOKE ALL ON FUNCTION public.haroolife_invite_code(), public.haroolife_invite_accept(text),
  public.haroolife_invite_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_invite_code(), public.haroolife_invite_accept(text),
  public.haroolife_invite_claim() TO authenticated;
