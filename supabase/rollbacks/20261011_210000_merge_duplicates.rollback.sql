-- Retire les fonctions de fusion. Les fusions déjà faites se défont à la main à partir
-- d'audit_logs (actions member.merge / cooperative.merge : identifiants archivés et tables déplacées).
DROP FUNCTION IF EXISTS public.merge_cooperatives(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.merge_members(uuid, uuid, uuid);
