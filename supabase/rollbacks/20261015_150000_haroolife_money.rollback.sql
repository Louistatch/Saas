-- Retour arrière de 20261015_150000_haroolife_money.sql (transferts d'argent du jeu).
DROP FUNCTION IF EXISTS public.haroolife_money_claim();
DROP FUNCTION IF EXISTS public.haroolife_money_send(text, integer, text, uuid);
DROP TABLE IF EXISTS public.haroolife_money_transfers;
