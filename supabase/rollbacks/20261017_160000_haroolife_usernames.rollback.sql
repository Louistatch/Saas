-- Retour arrière de 20261017_160000_haroolife_usernames.sql : les noms d'utilisateur sont
-- effacés. Les résidences créées et les noms affichés restent (le joueur garde sa maison).
DROP FUNCTION IF EXISTS public.haroolife_my_username();
DROP FUNCTION IF EXISTS public.haroolife_claim_username(text, text, integer);
DROP FUNCTION IF EXISTS public.haroolife_username_available(text);
DROP FUNCTION IF EXISTS private.haroolife_username_problem(text);
DROP TABLE IF EXISTS public.haroolife_usernames;
