-- Trafic du site, en interne (§ demande admin : suivi maison plutôt que
-- dépendre d'un service tiers non vérifiable depuis ici). Aucune donnée
-- personnelle stable : visitor_hash = sha256(ip + sel quotidien), jamais
-- l'IP en clair, jamais de cookie. Assez pour distinguer visiteurs
-- uniques par jour sans pouvoir réidentifier qui que ce soit plus tard.

CREATE TABLE site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  referrer text,
  visitor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_visits_created ON site_visits(created_at DESC);
CREATE INDEX idx_site_visits_path ON site_visits(path, created_at DESC);
CREATE INDEX idx_site_visits_visitor ON site_visits(visitor_hash, created_at DESC);

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

-- Lecture : super_admin uniquement. Écriture : service_role uniquement
-- (aucune policy INSERT côté client) — passe par app/api/track-visit,
-- qui calcule visitor_hash côté serveur à partir de l'IP de la requête.
CREATE POLICY "site visits super_admin read" ON site_visits
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
