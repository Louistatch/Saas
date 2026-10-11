-- Retour arrière de 20261012_120000_haroolife_togo.sql. Le pilote (haroolife_pilot, groups,
-- participations, events, board, command) n'est pas touché. Les résidences choisies sont perdues.
DROP FUNCTION IF EXISTS public.haroolife_world(uuid);
DROP FUNCTION IF EXISTS public.haroolife_say(uuid, text);
DROP TABLE IF EXISTS public.haroolife_messages;
DROP FUNCTION IF EXISTS public.haroolife_set_home(uuid, text, integer, boolean);
DROP FUNCTION IF EXISTS public.haroolife_suggest_canton();
DROP FUNCTION IF EXISTS private.haroolife_roles(uuid);
DROP TABLE IF EXISTS public.haroolife_residents;
