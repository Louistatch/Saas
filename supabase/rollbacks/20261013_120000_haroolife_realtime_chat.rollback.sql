-- Retour arrière de 20261013_120000_haroolife_realtime_chat.sql (messagerie temps réel HarooLife).
-- Supprime uniquement ce que la migration a créé. Les messages de chat sont perdus : exporter avant.
DROP FUNCTION IF EXISTS public.haroolife_chat_block(uuid);
DROP FUNCTION IF EXISTS public.haroolife_chat_report(uuid, text);
DROP FUNCTION IF EXISTS public.haroolife_chat_delete(uuid);
DROP FUNCTION IF EXISTS public.haroolife_chat_edit(uuid, text);
DROP FUNCTION IF EXISTS public.haroolife_chat_history(text, bigint, bigint, integer);
DROP FUNCTION IF EXISTS public.haroolife_chat_send(text, text, uuid);
DROP FUNCTION IF EXISTS public.haroolife_chat_me();
DROP FUNCTION IF EXISTS private.haroolife_chat_json(public.haroolife_chat_messages, uuid);
DROP FUNCTION IF EXISTS private.haroolife_author_key(uuid);
DROP FUNCTION IF EXISTS private.haroolife_chat_allowed(uuid, text, boolean);
DROP TABLE IF EXISTS public.haroolife_chat_blocks;
DROP TABLE IF EXISTS public.haroolife_chat_reports;
DROP TABLE IF EXISTS public.haroolife_chat_messages;
