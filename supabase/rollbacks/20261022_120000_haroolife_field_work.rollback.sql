-- Retour arrière de 20261022_120000_haroolife_field_work.sql. Les paies déjà versées restent dans
-- haroolife_money_transfers (argent du jeu encaissé ou à encaisser) : elles ne sont pas touchées.
DROP FUNCTION IF EXISTS public.haroolife_field_cancel(uuid);
DROP FUNCTION IF EXISTS public.haroolife_field_seen(uuid);
DROP FUNCTION IF EXISTS public.haroolife_field_answer(uuid, boolean);
DROP FUNCTION IF EXISTS public.haroolife_field_offers_mine();
DROP FUNCTION IF EXISTS public.haroolife_field_offer(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.haroolife_field_workers(text);
DROP FUNCTION IF EXISTS private.haroolife_field_expire(uuid);
DROP FUNCTION IF EXISTS private.haroolife_field_json(public.haroolife_field_offers);
DROP FUNCTION IF EXISTS private.haroolife_field_first_name(uuid);
DROP FUNCTION IF EXISTS private.haroolife_field_player(uuid);
DROP TABLE IF EXISTS public.haroolife_field_offers;
