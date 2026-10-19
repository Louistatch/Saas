-- Retour arrière de 20261015_140000_haroolife_dm_inbox.sql.
-- Supprime les positions de lecture et la file d'alertes (les messages ne sont pas touchés).
DROP FUNCTION IF EXISTS public.haroolife_dm_read(text);
DROP FUNCTION IF EXISTS public.haroolife_dm_inbox();
DROP TRIGGER IF EXISTS haroolife_dm_after_send ON public.haroolife_chat_messages;
DROP FUNCTION IF EXISTS private.haroolife_dm_after_send();
DROP TABLE IF EXISTS public.haroolife_dm_push;
DROP TABLE IF EXISTS public.haroolife_dm_reads;
