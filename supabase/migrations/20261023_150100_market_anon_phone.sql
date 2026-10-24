-- Marché : le téléphone, l'auteur et la fiche membre d'une annonce ne sont plus lisibles du
-- rôle anonyme. Le numéro se demande annonce par annonce, côté serveur, avec une limite
-- (app/api/market/announcements/[id]/contact). Les colonnes publiques restent lisibles.
-- ⚠️ À appliquer APRÈS le déploiement du code qui ne lit plus contact_phone dans la liste
-- des annonces (lib/market/announcements.ts) : avant, /marche échoue pour les visiteurs.
-- Prérequis : 20261023_150000_market_work.sql (colonnes de travail, has_contact,
-- accepts_responses).
-- Retour arrière : supabase/rollbacks/20261023_150100_market_anon_phone.rollback.sql

REVOKE SELECT ON public.producer_announcements FROM anon;
GRANT SELECT (
  id, cooperative_id, type, title, description, culture, quantity_kg, price_per_kg_fcfa,
  location_canton, status, created_at, region_id, prefecture_id, canton_id, expires_at,
  updated_at, wage_per_day_fcfa, positions, starts_on, work_days, has_contact,
  accepts_responses
) ON public.producer_announcements TO anon;
