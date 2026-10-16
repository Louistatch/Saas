-- Retour arrière de 20261017_130000_haroolife_invites.sql : plus d'invitations (les bonus déjà
-- versés restent dans les parties des joueurs).
DROP FUNCTION IF EXISTS public.haroolife_invite_claim();
DROP FUNCTION IF EXISTS public.haroolife_invite_accept(text);
DROP FUNCTION IF EXISTS public.haroolife_invite_code();
DROP TABLE IF EXISTS public.haroolife_referrals;
DROP TABLE IF EXISTS public.haroolife_invite_codes;
