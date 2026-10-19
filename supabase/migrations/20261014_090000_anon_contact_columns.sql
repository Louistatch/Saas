-- Données personnelles en lecture anonyme : le téléphone et le nom du coordinateur de chaque
-- coopérative (cooperatives.coordo_*) et le téléphone des techniciens étaient lisibles par
-- n'importe qui via l'API REST (politiques *_public_read = true pour tous les rôles).
--
-- On garde les politiques (les pages publiques lisent le nom, le logo, la hiérarchie…) mais on
-- retire ces colonnes au rôle anon. Les comptes connectés ne changent pas. La route
-- /api/technicien/[card_number] ne servait déjà rien à un anonyme (member_cards lui est fermé).
--
-- Aucune donnée n'est modifiée ni supprimée.
-- Retour arrière : supabase/rollbacks/20261014_090000_anon_contact_columns.rollback.sql

REVOKE SELECT ON public.cooperatives FROM anon;
GRANT SELECT (
  id, name, description, logo_url, primary_color, created_at, updated_at, faitiere_name, level,
  parent_id, village_id, culture_categories, deleted_at, is_demo
) ON public.cooperatives TO anon;

REVOKE SELECT ON public.techniciens FROM anon;
GRANT SELECT (id, faitiere_id, canton_id, name, created_at, updated_at) ON public.techniciens TO anon;
