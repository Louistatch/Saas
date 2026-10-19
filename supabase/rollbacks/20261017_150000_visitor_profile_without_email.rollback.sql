-- Retour arrière de 20261017_150000_visitor_profile_without_email.sql.
-- Échoue tant qu'un profil sans e-mail existe (un visiteur) : la contrainte ne peut revenir
-- qu'une fois ces visiteurs supprimés (ménage des visiteurs, 20261017_120000). À ne lancer
-- qu'après avoir de nouveau désactivé les connexions anonymes dans Supabase Auth.
ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;
