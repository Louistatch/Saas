-- Retour arrière de 20261016_130000_haroolife_moderation.sql : plus de suspensions ni de journal,
-- les signalements perdent leur état « traité » (ils restent en base), et la règle des salons
-- revient à sa version de 20261015_130000_haroolife_chat_dm.sql. Les messages masqués le restent.
DROP FUNCTION IF EXISTS public.haroolife_mod_act(text, uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.haroolife_mod_queue();
DROP FUNCTION IF EXISTS private.haroolife_mod_person(uuid);
DROP FUNCTION IF EXISTS private.haroolife_assert_moderator();
DROP TABLE IF EXISTS public.haroolife_mod_log;
DROP TABLE IF EXISTS public.haroolife_chat_bans;
ALTER TABLE public.haroolife_chat_reports DROP COLUMN IF EXISTS resolved_by, DROP COLUMN IF EXISTS resolved_at;
ALTER TABLE public.haroolife_chat_user_reports DROP COLUMN IF EXISTS resolved_by, DROP COLUMN IF EXISTS resolved_at;

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
