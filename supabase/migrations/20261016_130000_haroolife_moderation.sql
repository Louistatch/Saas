-- HarooLife : la modération du chat par l'équipe. Les joueurs signalent un message ou un joueur
-- depuis le jeu ; jusqu'ici personne ne voyait ces signalements.
--   - haroolife_mod_queue() : signalements ouverts (messages et joueurs) et suspensions en cours ;
--   - haroolife_mod_act(type, cible, action, motif, jours) : masquer le message, classer sans
--     suite, suspendre l'écriture pour N jours, lever la suspension ; chaque décision est
--     journalisée (haroolife_mod_log) ;
--   - un joueur suspendu lit toujours, mais n'écrit plus nulle part (salons et messages privés).
-- Réservé aux super_admin (profiles.role), vérifié dans chaque fonction. L'équipe voit le message
-- signalé, jamais le reste d'une conversation privée.
-- Dépend de 20261015_130000_haroolife_chat_dm.sql.
-- Additif : deux colonnes nullables sur les tables de signalements, deux tables, trois fonctions ;
-- private.haroolife_chat_allowed est remplacée par une version qui garde toutes ses règles et
-- refuse l'écriture à un joueur suspendu. Aucune ligne n'est modifiée.
-- Retour arrière : supabase/rollbacks/20261016_130000_haroolife_moderation.rollback.sql

ALTER TABLE public.haroolife_chat_reports
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.haroolife_chat_user_reports
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE public.haroolife_chat_bans (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.haroolife_mod_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('message', 'player')),
  target uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('hide', 'dismiss', 'suspend', 'unsuspend')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.haroolife_chat_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_mod_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_chat_bans, public.haroolife_mod_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_chat_bans, public.haroolife_mod_log TO service_role;

-- Règles des salons : celles d'avant, et un joueur suspendu n'écrit plus (il lit toujours).
CREATE OR REPLACE FUNCTION private.haroolife_chat_allowed(p_user uuid, p_room text, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE prof public.profiles; kind text := split_part(p_room, ':', 1); ref text := split_part(p_room, ':', 2);
        mine text; a text; b text; other uuid;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = p_user AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_write AND EXISTS (SELECT 1 FROM public.haroolife_chat_bans WHERE user_id = p_user AND until > now()) THEN
    RETURN false;
  END IF;
  IF kind = 'dm' THEN
    IF p_room !~ '^dm:[0-9a-f]{16}:[0-9a-f]{16}$' THEN RETURN false; END IF;
    a := split_part(p_room, ':', 2); b := split_part(p_room, ':', 3);
    IF a >= b THEN RETURN false; END IF;
    mine := private.haroolife_author_key(p_user);
    IF mine NOT IN (a, b) THEN RETURN false; END IF;
    other := private.haroolife_user_by_key(CASE WHEN mine = a THEN b ELSE a END);
    IF other IS NULL OR private.haroolife_dm_blocked(p_user, other) THEN RETURN false; END IF;
    RETURN NOT p_write OR EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = p_user);
  END IF;
  IF prof.role = 'super_admin' THEN RETURN true; END IF;
  IF kind IN ('world', 'locality') THEN
    RETURN NOT p_write OR EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = p_user);
  END IF;
  IF ref !~ '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
  IF kind = 'canton' THEN
    RETURN EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = p_user AND canton_id = ref::uuid);
  END IF;
  IF kind = 'coop' THEN
    RETURN coalesce(prof.cooperative_id = ref::uuid, false) AND prof.role IN ('member', 'cooperative_admin');
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION private.haroolife_assert_moderator()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = actor AND role = 'super_admin' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Réservé à l’équipe de modération' USING ERRCODE = '42501';
  END IF;
  RETURN actor;
END $$;

-- Qui est ce joueur, pour l'équipe : son nom dans le jeu, sa clé, son compte.
CREATE OR REPLACE FUNCTION private.haroolife_mod_person(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p_user,
    'key', private.haroolife_author_key(p_user),
    'name', coalesce((SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = p_user), 'Habitant'),
    'email', (SELECT to_jsonb(p)->>'email' FROM public.profiles p WHERE p.id = p_user),
    'suspended_until', (SELECT b.until FROM public.haroolife_chat_bans b WHERE b.user_id = p_user AND b.until > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.haroolife_mod_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.haroolife_assert_moderator();
  RETURN jsonb_build_object(
    'messages', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'last' DESC) FROM (
        SELECT jsonb_build_object(
          'id', m.id, 'room', m.room, 'body', m.body, 'hidden', m.deleted_at IS NOT NULL,
          'created_at', m.created_at, 'author', private.haroolife_mod_person(m.user_id),
          'count', count(r.id), 'last', max(r.created_at),
          'reasons', jsonb_agg(DISTINCT r.reason)
        ) AS x
        FROM public.haroolife_chat_reports r
        JOIN public.haroolife_chat_messages m ON m.id = r.message_id
        WHERE r.resolved_at IS NULL
        GROUP BY m.id
      ) q), '[]'),
    'players', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'last' DESC) FROM (
        SELECT jsonb_build_object(
          'player', private.haroolife_mod_person(u.reported_id),
          'count', count(u.id), 'last', max(u.created_at),
          'reasons', jsonb_agg(DISTINCT u.reason)
        ) AS x
        FROM public.haroolife_chat_user_reports u
        WHERE u.resolved_at IS NULL
        GROUP BY u.reported_id
      ) q), '[]'),
    'suspended', coalesce((
      SELECT jsonb_agg(private.haroolife_mod_person(b.user_id) || jsonb_build_object('reason', b.reason)
                       ORDER BY b.until)
      FROM public.haroolife_chat_bans b WHERE b.until > now()), '[]'),
    'log', coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', l.kind, 'action', l.action, 'reason', l.reason,
                                          'at', l.created_at, 'target', l.target) ORDER BY l.id DESC)
      FROM (SELECT * FROM public.haroolife_mod_log ORDER BY id DESC LIMIT 30) l), '[]')
  );
END $$;

-- Une décision de l'équipe. Message : hide (masqué pour tous), dismiss (classé), suspend (masqué
-- et son auteur suspendu). Joueur : dismiss, suspend, unsuspend.
CREATE OR REPLACE FUNCTION public.haroolife_mod_act(
  p_kind text, p_target uuid, p_action text, p_reason text, p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := private.haroolife_assert_moderator(); m public.haroolife_chat_messages;
        who uuid; why text := left(coalesce(nullif(trim(p_reason), ''), 'Décision de modération'), 200);
        days integer := least(greatest(coalesce(p_days, 7), 1), 365);
BEGIN
  IF p_kind = 'message' THEN
    SELECT * INTO m FROM public.haroolife_chat_messages WHERE id = p_target;
    IF NOT FOUND THEN RAISE EXCEPTION 'Message introuvable' USING ERRCODE = '22023'; END IF;
    IF p_action NOT IN ('hide', 'dismiss', 'suspend') THEN
      RAISE EXCEPTION 'Action inconnue' USING ERRCODE = '22023';
    END IF;
    IF p_action IN ('hide', 'suspend') THEN
      UPDATE public.haroolife_chat_messages SET deleted_at = coalesce(deleted_at, now()) WHERE id = p_target;
    END IF;
    UPDATE public.haroolife_chat_reports SET resolved_at = now(), resolved_by = actor
      WHERE message_id = p_target AND resolved_at IS NULL;
    who := m.user_id;
  ELSIF p_kind = 'player' THEN
    IF p_action NOT IN ('dismiss', 'suspend', 'unsuspend') THEN
      RAISE EXCEPTION 'Action inconnue' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target) THEN
      RAISE EXCEPTION 'Joueur introuvable' USING ERRCODE = '22023';
    END IF;
    UPDATE public.haroolife_chat_user_reports SET resolved_at = now(), resolved_by = actor
      WHERE reported_id = p_target AND resolved_at IS NULL;
    who := p_target;
  ELSE
    RAISE EXCEPTION 'Type inconnu' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'suspend' THEN
    IF who = actor THEN RAISE EXCEPTION 'Impossible de se suspendre soi-même' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.haroolife_chat_bans(user_id, until, reason, by_id)
    VALUES (who, now() + make_interval(days => days), why, actor)
    ON CONFLICT (user_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason,
                                        by_id = EXCLUDED.by_id, created_at = now();
  ELSIF p_action = 'unsuspend' THEN
    DELETE FROM public.haroolife_chat_bans WHERE user_id = who;
  END IF;
  INSERT INTO public.haroolife_mod_log(actor_id, kind, target, action, reason)
  VALUES (actor, p_kind, p_target, p_action, why);
  RETURN jsonb_build_object('ok', true, 'person', private.haroolife_mod_person(who));
END $$;

REVOKE ALL ON FUNCTION private.haroolife_assert_moderator(), private.haroolife_mod_person(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_mod_queue(), public.haroolife_mod_act(text, uuid, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_mod_queue(), public.haroolife_mod_act(text, uuid, text, text, integer)
  TO authenticated;
