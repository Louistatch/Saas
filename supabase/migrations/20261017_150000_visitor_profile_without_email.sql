-- Un visiteur HarooLife (compte anonyme Supabase) n'a pas d'e-mail. handle_new_user() lui crée
-- quand même son profil (le jeu en dépend : chat, sauvegarde, argent, résidence) en copiant
-- NEW.email, qui vaut NULL : la contrainte NOT NULL de profiles.email faisait échouer toute
-- l'inscription (« Database error saving new user »), donc le bouton « Jouer en visiteur ».
-- Seule cette contrainte est levée : l'unicité (profiles_email_key) reste et accepte plusieurs
-- NULL ; un compte FaîtiereHub s'inscrit toujours avec un e-mail. Aucune ligne n'est touchée.
-- Retour arrière : supabase/rollbacks/20261017_150000_visitor_profile_without_email.rollback.sql
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
