-- Retour arrière de 20261015_120000_haroolife_chat_dm.sql (messages privés HarooLife).
-- Les conversations privées (salons dm:) sont SUPPRIMÉES : exporter avant si besoin.
-- Les fonctions remplacées reprennent leur définition de 20261013_120000_haroolife_realtime_chat.sql.
DROP FUNCTION IF EXISTS public.haroolife_chat_report_user(text, text);
DROP FUNCTION IF EXISTS public.haroolife_chat_block_key(text);
DROP FUNCTION IF EXISTS public.haroolife_dm_peers();
DROP FUNCTION IF EXISTS public.haroolife_dm_open(text);
DROP TABLE IF EXISTS public.haroolife_chat_user_reports;
DELETE FROM public.haroolife_chat_messages WHERE room LIKE 'dm:%';
ALTER TABLE public.haroolife_chat_messages DROP CONSTRAINT IF EXISTS haroolife_chat_messages_room_check;
ALTER TABLE public.haroolife_chat_messages ADD CONSTRAINT haroolife_chat_messages_room_check CHECK (
  room ~ '^(world:togo|locality:(lome|kara)|canton:[0-9a-f-]{36}|coop:[0-9a-f-]{36})$'
);

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

DROP FUNCTION IF EXISTS private.haroolife_peer_json(uuid);
DROP FUNCTION IF EXISTS private.haroolife_dm_rooms(uuid);
DROP FUNCTION IF EXISTS private.haroolife_dm_room(text, text);
DROP FUNCTION IF EXISTS private.haroolife_dm_blocked(uuid, uuid);
DROP FUNCTION IF EXISTS private.haroolife_user_by_key(text);
