-- Reconnaissance de visiteur + géolocalisation (§ demande : « on sait que
-- c'est lui, et sa position »). Additif sur site_visits.
--
-- visitor_id : uuid posé en cookie httpOnly de première partie (2 ans),
-- généré et lu par app/api/track-visit — remplace visitor_hash comme
-- identifiant principal (le hash quotidien ne survivait pas d'un jour à
-- l'autre, donc ne pouvait jamais reconnaître un visiteur qui revient).
-- visitor_hash reste en repli pour les visiteurs qui bloquent les cookies
-- (jamais NULL, contrairement à visitor_id).
--
-- Géolocalisation : aucun service tiers, aucun appel réseau supplémentaire
-- — Vercel résout déjà pays/région/ville/coordonnées à l'edge et les pose
-- en en-têtes de requête (x-vercel-ip-*), gratuits, sans latence ajoutée.
-- Absents en local (dev) : colonnes nullable, dégradation silencieuse.

ALTER TABLE site_visits ADD COLUMN visitor_id uuid;
ALTER TABLE site_visits ADD COLUMN is_new_visitor boolean NOT NULL DEFAULT true;
ALTER TABLE site_visits ADD COLUMN country text;
ALTER TABLE site_visits ADD COLUMN region text;
ALTER TABLE site_visits ADD COLUMN city text;
ALTER TABLE site_visits ADD COLUMN latitude double precision;
ALTER TABLE site_visits ADD COLUMN longitude double precision;

CREATE INDEX idx_site_visits_visitor_id ON site_visits(visitor_id, created_at DESC);
CREATE INDEX idx_site_visits_country ON site_visits(country) WHERE country IS NOT NULL;

COMMENT ON COLUMN site_visits.visitor_id IS
  'Cookie httpOnly de première partie (fh_vid, 2 ans), posé par app/api/track-visit. Permet de reconnaître un visiteur qui revient, contrairement à visitor_hash qui change chaque jour.';
COMMENT ON COLUMN site_visits.is_new_visitor IS
  'true si le cookie fh_vid vient d''être créé sur cette requête (première visite connue) ; false si le cookie existait déjà (visiteur qui revient).';
