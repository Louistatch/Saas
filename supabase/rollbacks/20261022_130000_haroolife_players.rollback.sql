-- Retour arrière de 20261022_130000_haroolife_players.sql. Les conversations privées déjà ouvertes
-- depuis la liste des joueurs restent (haroolife_chat_messages n'est pas touchée).
DROP FUNCTION IF EXISTS public.haroolife_players(text, integer);
DROP FUNCTION IF EXISTS public.haroolife_here(text);
DROP FUNCTION IF EXISTS private.haroolife_resident_count();
DROP FUNCTION IF EXISTS private.haroolife_online_count();
DROP TABLE IF EXISTS public.haroolife_last_seen;
