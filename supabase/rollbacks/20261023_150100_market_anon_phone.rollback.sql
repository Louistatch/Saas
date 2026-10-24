-- Retour arrière de 20261023_150100_market_anon_phone.sql : le rôle anonyme relit toutes
-- les colonnes des annonces, téléphone compris.

GRANT SELECT ON public.producer_announcements TO anon;
