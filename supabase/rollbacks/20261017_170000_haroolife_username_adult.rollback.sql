-- Retour arrière de 20261017_170000_haroolife_username_adult.sql : plus de contrôle 18+ côté
-- base. Rejouer ensuite la fonction haroolife_claim_username de 20261017_160000_haroolife_usernames.sql
-- (son corps d'origine), puis retirer ce qui a été ajouté.
DROP FUNCTION IF EXISTS public.haroolife_take_username(text, text, integer, boolean);
ALTER TABLE public.haroolife_usernames DROP COLUMN IF EXISTS adult_confirmed_at;
