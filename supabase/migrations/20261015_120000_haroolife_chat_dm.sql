-- HarooLife : messages privés entre joueurs rencontrés dans la rue (relais Socket.IO).
-- Un salon privé dm:<clé>:<clé> réunit deux habitants, désignés par leur clé d'auteur opaque
-- (jamais l'identifiant du compte). Règle de consentement :
--   - tout habitant peut écrire à un autre habitant qu'il a croisé (sa clé lui est donnée par
--     la présence du relais) ;
--   - un blocage, dans un sens ou dans l'autre, ferme la conversation (lecture et écriture) ;
--   - au plus 20 nouvelles conversations par jour et par personne (anti-sollicitation) ;
--   - un joueur peut être signalé à l'équipe depuis sa fiche, sans message.
-- Dépend de 20261013_120000_haroolife_realtime_chat.sql.
-- Additif : la contrainte de format des salons est élargie (aucune ligne existante n'est
-- touchée) ; les fonctions haroolife_chat_allowed et haroolife_chat_me sont remplacées par des
-- versions qui gardent les règles existantes et ajoutent les salons privés.
-- NON APPLIQUÉE en production tant que le fondateur ne l'a pas validée.
-- Retour arrière : supabase/rollbacks/20261015_120000_haroolife_chat_dm.rollback.sql

-- 1. Format des salons : + dm:<clé>:<clé> (clés de 16 caractères hexadécimaux, triées).
ALTER TABLE public.haroolife_chat_messages DROP CONSTRAINT IF EXISTS haroolife_chat_messages_room_check;
ALTER TABLE public.haroolife_chat_messages ADD CONSTRAINT haroolife_chat_messages_room_check CHECK (
  room ~ '^(world:togo|locality:(lome|kara)|canton:[0-9a-f-]{36}|coop:[0-9a-f-]{36}|dm:[0-9a-f]{16}:[0-9a-f]{16})$'
);

-- 2. Signalements de joueurs (depuis leur fiche, sans message).
CREATE TABLE public.haroolife_chat_user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reported_id, reporter_id),
  CHECK (reported_id <> reporter_id)
);
ALTER TABLE public.haroolife_chat_user_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_chat_user_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_chat_user_reports TO service_role;

-- 3. Clé d'auteur → habitant (seuls les habitants, ceux que l'on croise dans le jeu).
CREATE OR REPLACE FUNCTION private.haroolife_user_by_key(p_key text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT h.user_id FROM public.haroolife_residents h
  JOIN public.profiles p ON p.id = h.user_id AND p.deleted_at IS NULL
  WHERE p_key ~ '^[0-9a-f]{16}$' AND private.haroolife_author_key(h.user_id) = p_key
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.haroolife_dm_blocked(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.haroolife_chat_blocks k
                 WHERE (k.user_id = a AND k.blocked_id = b) OR (k.user_id = b AND k.blocked_id = a))
$$;

-- Salon privé de deux clés (ordre stable, quel que soit celui qui ouvre).
CREATE OR REPLACE FUNCTION private.haroolife_dm_room(a text, b text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'dm:' || least(a, b) || ':' || greatest(a, b)
$$;

-- 4. Règles des salons : les règles existantes, plus les salons privés.
CREATE OR REPLACE FUNCTION private.haroolife_chat_allowed(p_user uuid, p_room text, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE prof public.profiles; kind text := split_part(p_room, ':', 1); ref text := split_part(p_room, ':', 2);
        mine text; a text; b text; other uuid;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = p_user AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  IF kind = 'dm' THEN
    -- Une conversation privée n'appartient qu'à ses deux personnes (pas d'exception de modération :
    -- l'équipe voit les messages signalés, pas les conversations).
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

-- Conversations privées de la personne : salons où elle ou l'autre a écrit, toujours ouverts.
CREATE OR REPLACE FUNCTION private.haroolife_dm_rooms(p_user uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(r ORDER BY last DESC), '{}') FROM (
    SELECT m.room AS r, max(m.seq) AS last
    FROM public.haroolife_chat_messages m
    WHERE m.room LIKE 'dm:%'
      AND (split_part(m.room, ':', 2) = private.haroolife_author_key(p_user)
           OR split_part(m.room, ':', 3) = private.haroolife_author_key(p_user))
    GROUP BY m.room
  ) t
  WHERE private.haroolife_chat_allowed(p_user, r, false)
$$;

-- 5. Identité et salons à la connexion : comme avant, plus les conversations privées.
CREATE OR REPLACE FUNCTION public.haroolife_chat_me()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); rooms text[] := '{}'; r text; home public.haroolife_residents; prof public.profiles;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = actor AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte inconnu' USING ERRCODE = '42501'; END IF;
  SELECT * INTO home FROM public.haroolife_residents WHERE user_id = actor;
  FOREACH r IN ARRAY ARRAY['world:togo', 'locality:lome', 'locality:kara'] LOOP
    IF private.haroolife_chat_allowed(actor, r, false) THEN rooms := rooms || r; END IF;
  END LOOP;
  IF home.canton_id IS NOT NULL THEN rooms := rooms || ('canton:' || home.canton_id::text); END IF;
  IF prof.cooperative_id IS NOT NULL AND private.haroolife_chat_allowed(actor, 'coop:' || prof.cooperative_id::text, false) THEN
    rooms := rooms || ('coop:' || prof.cooperative_id::text);
  END IF;
  rooms := rooms || private.haroolife_dm_rooms(actor);
  RETURN jsonb_build_object(
    'key', private.haroolife_author_key(actor),
    'name', coalesce(home.display_name, 'Habitant'),
    'pagne', coalesce(home.pagne, 1),
    'can_write', home.user_id IS NOT NULL OR prof.role = 'super_admin',
    'rooms', to_jsonb(rooms),
    'blocked', coalesce((SELECT jsonb_agg(private.haroolife_author_key(b.blocked_id))
                         FROM public.haroolife_chat_blocks b WHERE b.user_id = actor), '[]')
  );
END $$;

CREATE OR REPLACE FUNCTION private.haroolife_peer_json(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'key', private.haroolife_author_key(p_user),
    'name', coalesce((SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = p_user), 'Habitant'),
    'pagne', coalesce((SELECT h.pagne FROM public.haroolife_residents h WHERE h.user_id = p_user), 1)
  )
$$;

-- 6. Ouvrir une conversation privée avec un joueur croisé (sa clé). Rend le salon et le
--    correspondant ; refuse soi-même, un inconnu, un blocage, et au-delà de 20 nouvelles
--    conversations en 24 h.
CREATE OR REPLACE FUNCTION public.haroolife_dm_open(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); other uuid; v_room text; started integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = actor) THEN
    RAISE EXCEPTION 'Choisis d’abord ta maison pour écrire' USING ERRCODE = '42501';
  END IF;
  other := private.haroolife_user_by_key(p_key);
  IF other IS NULL OR other = actor THEN RAISE EXCEPTION 'Joueur introuvable' USING ERRCODE = '42501'; END IF;
  IF private.haroolife_dm_blocked(actor, other) THEN
    RAISE EXCEPTION 'Conversation non autorisée' USING ERRCODE = '42501';
  END IF;
  v_room := private.haroolife_dm_room(private.haroolife_author_key(actor), p_key);
  IF NOT EXISTS (SELECT 1 FROM public.haroolife_chat_messages WHERE room = v_room) THEN
    -- Nouvelles conversations commencées par la personne depuis 24 h (premier message à elle).
    SELECT count(*) INTO started FROM (
      SELECT DISTINCT ON (m.room) m.room, m.user_id
      FROM public.haroolife_chat_messages m
      WHERE m.room LIKE 'dm:%'
        AND (split_part(m.room, ':', 2) = private.haroolife_author_key(actor)
             OR split_part(m.room, ':', 3) = private.haroolife_author_key(actor))
      ORDER BY m.room, m.seq
    ) f
    JOIN public.haroolife_chat_messages first ON first.room = f.room AND first.user_id = actor
    WHERE f.user_id = actor AND first.created_at > now() - interval '24 hours';
    IF started >= 20 THEN
      RAISE EXCEPTION 'Trop de nouvelles conversations aujourd’hui : réessaie demain' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN jsonb_build_object('room', v_room, 'peer', private.haroolife_peer_json(other));
END $$;

-- 7. Correspondants des conversations privées (pour nommer les salons dans le téléphone).
CREATE OR REPLACE FUNCTION public.haroolife_dm_peers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); mine text; out jsonb := '{}'; r text; other text; u uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  mine := private.haroolife_author_key(actor);
  FOREACH r IN ARRAY private.haroolife_dm_rooms(actor) LOOP
    other := CASE WHEN split_part(r, ':', 2) = mine THEN split_part(r, ':', 3) ELSE split_part(r, ':', 2) END;
    u := private.haroolife_user_by_key(other);
    IF u IS NOT NULL THEN out := out || jsonb_build_object(r, private.haroolife_peer_json(u)); END IF;
  END LOOP;
  RETURN out;
END $$;

-- 8. Depuis la fiche d'un joueur : le bloquer, le signaler (par sa clé, sans message).
CREATE OR REPLACE FUNCTION public.haroolife_chat_block_key(p_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); other uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  other := private.haroolife_user_by_key(p_key);
  IF other IS NULL OR other = actor THEN RAISE EXCEPTION 'Joueur introuvable' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.haroolife_chat_blocks(user_id, blocked_id) VALUES (actor, other) ON CONFLICT DO NOTHING;
  RETURN p_key;
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_chat_report_user(p_key text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); other uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  other := private.haroolife_user_by_key(p_key);
  IF other IS NULL OR other = actor THEN RAISE EXCEPTION 'Joueur introuvable' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.haroolife_chat_user_reports(reported_id, reporter_id, reason)
    VALUES (other, actor, left(coalesce(nullif(trim(p_reason), ''), 'Signalé'), 200))
    ON CONFLICT (reported_id, reporter_id) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION private.haroolife_user_by_key(text), private.haroolife_dm_blocked(uuid, uuid),
  private.haroolife_dm_room(text, text), private.haroolife_dm_rooms(uuid),
  private.haroolife_peer_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_dm_open(text), public.haroolife_dm_peers(),
  public.haroolife_chat_block_key(text), public.haroolife_chat_report_user(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_dm_open(text), public.haroolife_dm_peers(),
  public.haroolife_chat_block_key(text), public.haroolife_chat_report_user(text, text)
  TO authenticated, service_role;
