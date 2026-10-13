-- HarooLife D4+ (M1) : messagerie instantanée persistante du jeu, servie par le relais Socket.IO.
-- Le message est une donnée durable : il est enregistré ici, par une fonction autorisée,
-- idempotente (client_id), AVANT toute diffusion. Le relais appelle ces fonctions avec le jeton
-- de la personne (auth.uid()), jamais avec la clé service_role.
-- Additif : aucune table, politique ni fonction existante n'est modifiée ; les messages de canton
-- (haroolife_messages / haroolife_say) restent en place.
-- NON APPLIQUÉE en production tant que le fondateur ne l'a pas validée.
-- Retour arrière : supabase/rollbacks/20261013_120000_haroolife_realtime_chat.rollback.sql

-- 1. Messages : un salon par périmètre. seq sert de curseur de rattrapage après reconnexion.
CREATE TABLE public.haroolife_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  room text NOT NULL CHECK (
    room ~ '^(world:togo|locality:(lome|kara)|canton:[0-9a-f-]{36}|coop:[0-9a-f-]{36})$'
  ),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  client_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (user_id, client_id)
);
CREATE INDEX haroolife_chat_messages_room ON public.haroolife_chat_messages(room, seq DESC);
CREATE INDEX haroolife_chat_messages_user ON public.haroolife_chat_messages(user_id, created_at DESC);
ALTER TABLE public.haroolife_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_chat_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_chat_messages TO service_role;

-- 2. Modération : signalements (lus par l'équipe) et blocages (préférence de la personne).
CREATE TABLE public.haroolife_chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.haroolife_chat_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);
CREATE TABLE public.haroolife_chat_blocks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);
ALTER TABLE public.haroolife_chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_chat_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_chat_reports, public.haroolife_chat_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_chat_reports, public.haroolife_chat_blocks TO service_role;

-- 3. Qui peut lire / écrire dans un salon. Lire : compte actif. Écrire : avoir une maison
--    (règle existante de la place du canton). Canton : y habiter. Coopérative : en être membre.
--    super_admin : lecture et écriture partout (modération).
CREATE OR REPLACE FUNCTION private.haroolife_chat_allowed(p_user uuid, p_room text, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE prof public.profiles; kind text := split_part(p_room, ':', 1); ref text := split_part(p_room, ':', 2);
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = p_user AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
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

-- Clé d'auteur stable et opaque : jamais l'identifiant du compte, ni téléphone, ni e-mail.
CREATE OR REPLACE FUNCTION private.haroolife_author_key(p_user uuid)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT left(md5('haroolife-author:' || p_user::text), 16)
$$;

CREATE OR REPLACE FUNCTION private.haroolife_chat_json(m public.haroolife_chat_messages, p_viewer uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'seq', m.seq, 'room', m.room,
    'body', CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END,
    'deleted', m.deleted_at IS NOT NULL, 'edited', m.edited_at IS NOT NULL,
    'created_at', m.created_at, 'client_id', CASE WHEN m.user_id = p_viewer THEN m.client_id END,
    'mine', m.user_id = p_viewer,
    'author', jsonb_build_object(
      'key', private.haroolife_author_key(m.user_id),
      'name', coalesce((SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = m.user_id), 'Habitant'),
      'pagne', coalesce((SELECT h.pagne FROM public.haroolife_residents h WHERE h.user_id = m.user_id), 1)
    )
  )
$$;

-- 4. Salons autorisés et identité affichable de la personne connectée (lus à la connexion).
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

-- 5. Envoyer : idempotent par client_id (un renvoi après coupure rend le même message).
CREATE OR REPLACE FUNCTION public.haroolife_chat_send(p_room text, p_body text, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); body text := regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g');
        m public.haroolife_chat_messages;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Identifiant client manquant' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM public.haroolife_chat_messages WHERE user_id = actor AND client_id = p_client_id;
  IF FOUND THEN RETURN private.haroolife_chat_json(m, actor) || jsonb_build_object('duplicate', true); END IF;
  IF NOT private.haroolife_chat_allowed(actor, p_room, true) THEN
    RAISE EXCEPTION 'Salon non autorisé' USING ERRCODE = '42501';
  END IF;
  IF length(body) < 1 OR length(body) > 500 THEN
    RAISE EXCEPTION 'Message vide ou trop long (500 caractères)' USING ERRCODE = '22023';
  END IF;
  IF body ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN
    RAISE EXCEPTION 'Caractères non autorisés' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.haroolife_chat_messages
      WHERE user_id = actor AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'Trop de messages : attendez une minute' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.haroolife_chat_messages(room, user_id, body, client_id)
    VALUES (p_room, actor, body, p_client_id) RETURNING * INTO m;
  RETURN private.haroolife_chat_json(m, actor) || jsonb_build_object('duplicate', false);
END $$;

-- 6. Historique paginé : les plus récents (avant un curseur) ou le rattrapage (après un curseur).
--    Les auteurs bloqués par la personne sont omis.
CREATE OR REPLACE FUNCTION public.haroolife_chat_history(
  p_room text, p_after bigint DEFAULT NULL, p_before bigint DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT private.haroolife_chat_allowed(actor, p_room, false) THEN
    RAISE EXCEPTION 'Salon non autorisé' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(private.haroolife_chat_json(t, actor) ORDER BY t.seq)
    FROM (
      SELECT m.* FROM public.haroolife_chat_messages m
      WHERE m.room = p_room
        AND (p_after IS NULL OR m.seq > p_after)
        AND (p_before IS NULL OR m.seq < p_before)
        AND NOT EXISTS (SELECT 1 FROM public.haroolife_chat_blocks b WHERE b.user_id = actor AND b.blocked_id = m.user_id)
      ORDER BY CASE WHEN p_after IS NULL THEN -m.seq ELSE m.seq END
      LIMIT lim
    ) t), '[]');
END $$;

-- 7. Modifier / effacer son message (ou modération super_admin). Retourne le message à diffuser.
CREATE OR REPLACE FUNCTION public.haroolife_chat_edit(p_id uuid, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); v_body text := regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g');
        m public.haroolife_chat_messages;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF length(v_body) < 1 OR length(v_body) > 500 OR v_body ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' THEN
    RAISE EXCEPTION 'Message vide ou trop long (500 caractères)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.haroolife_chat_messages SET body = v_body, edited_at = now()
    WHERE id = p_id AND user_id = actor AND deleted_at IS NULL AND created_at > now() - interval '15 minutes'
    RETURNING * INTO m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message introuvable ou plus modifiable' USING ERRCODE = '42501'; END IF;
  RETURN private.haroolife_chat_json(m, actor);
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_chat_delete(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); m public.haroolife_chat_messages;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  UPDATE public.haroolife_chat_messages SET deleted_at = now()
    WHERE id = p_id AND deleted_at IS NULL
      AND (user_id = actor OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = actor AND p.role = 'super_admin'))
    RETURNING * INTO m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message introuvable' USING ERRCODE = '42501'; END IF;
  RETURN private.haroolife_chat_json(m, actor);
END $$;

-- 8. Signaler un message ; bloquer son auteur (sans jamais révéler son identifiant).
CREATE OR REPLACE FUNCTION public.haroolife_chat_report(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); m public.haroolife_chat_messages;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM public.haroolife_chat_messages WHERE id = p_id;
  IF NOT FOUND OR NOT private.haroolife_chat_allowed(actor, m.room, false) THEN
    RAISE EXCEPTION 'Message introuvable' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.haroolife_chat_reports(message_id, reporter_id, reason)
    VALUES (p_id, actor, left(coalesce(nullif(trim(p_reason), ''), 'Signalé'), 200))
    ON CONFLICT (message_id, reporter_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_chat_block(p_message uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); m public.haroolife_chat_messages;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM public.haroolife_chat_messages WHERE id = p_message;
  IF NOT FOUND OR m.user_id = actor OR NOT private.haroolife_chat_allowed(actor, m.room, false) THEN
    RAISE EXCEPTION 'Message introuvable' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.haroolife_chat_blocks(user_id, blocked_id) VALUES (actor, m.user_id)
    ON CONFLICT DO NOTHING;
  RETURN private.haroolife_author_key(m.user_id);
END $$;

REVOKE ALL ON FUNCTION private.haroolife_chat_allowed(uuid, text, boolean),
  private.haroolife_author_key(uuid),
  private.haroolife_chat_json(public.haroolife_chat_messages, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_chat_me(), public.haroolife_chat_send(text, text, uuid),
  public.haroolife_chat_history(text, bigint, bigint, integer), public.haroolife_chat_edit(uuid, text),
  public.haroolife_chat_delete(uuid), public.haroolife_chat_report(uuid, text),
  public.haroolife_chat_block(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_chat_me(), public.haroolife_chat_send(text, text, uuid),
  public.haroolife_chat_history(text, bigint, bigint, integer), public.haroolife_chat_edit(uuid, text),
  public.haroolife_chat_delete(uuid), public.haroolife_chat_report(uuid, text),
  public.haroolife_chat_block(uuid) TO authenticated, service_role;
