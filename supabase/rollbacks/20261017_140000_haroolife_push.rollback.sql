-- Retour arrière de 20261017_140000_haroolife_push.sql : plus d'alertes « argent reçu » ni
-- « ami arrivé » (les transferts et les invitations restent intacts).
DROP TRIGGER IF EXISTS haroolife_push_invite ON public.haroolife_referrals;
DROP TRIGGER IF EXISTS haroolife_push_money ON public.haroolife_money_transfers;
DROP FUNCTION IF EXISTS private.haroolife_push_invite();
DROP FUNCTION IF EXISTS private.haroolife_push_money();
DROP FUNCTION IF EXISTS private.haroolife_fcfa(integer);
DROP TABLE IF EXISTS public.haroolife_push;
