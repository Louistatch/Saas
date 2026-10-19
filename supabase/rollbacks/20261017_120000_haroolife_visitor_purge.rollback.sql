-- Retour arrière de 20261017_120000_haroolife_visitor_purge.sql : plus de ménage des visiteurs.
-- (Les comptes déjà supprimés ne reviennent pas.)
DROP FUNCTION IF EXISTS public.haroolife_purge_visitors(integer, integer);
