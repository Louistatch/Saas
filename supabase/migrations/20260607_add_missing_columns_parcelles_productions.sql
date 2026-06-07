-- ─────────────────────────────────────────────────────────────
-- parcelles : colonnes manquantes pour Kobo + carnet journal
-- ─────────────────────────────────────────────────────────────
ALTER TABLE parcelles
  ADD COLUMN IF NOT EXISTS culture_name      TEXT,
  ADD COLUMN IF NOT EXISTS surface_ha        NUMERIC,
  ADD COLUMN IF NOT EXISTS gps_coordinates   TEXT,
  ADD COLUMN IF NOT EXISTS campaign_year     TEXT,
  ADD COLUMN IF NOT EXISTS source            TEXT DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_parcelles_culture_name   ON parcelles(culture_name);
CREATE INDEX IF NOT EXISTS idx_parcelles_campaign_year  ON parcelles(campaign_year);
CREATE INDEX IF NOT EXISTS idx_parcelles_source         ON parcelles(source);

-- Backfill depuis les colonnes existantes
UPDATE parcelles SET culture_name = culture_principale
WHERE culture_name IS NULL AND culture_principale IS NOT NULL;

UPDATE parcelles SET surface_ha = superficie_ha
WHERE surface_ha IS NULL AND superficie_ha IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- productions : colonnes manquantes pour Kobo + ATS engine
-- ─────────────────────────────────────────────────────────────
ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS member_id         UUID REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cooperative_id    UUID REFERENCES cooperatives(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS culture_name      TEXT,
  ADD COLUMN IF NOT EXISTS quantity_kg       NUMERIC CHECK (quantity_kg IS NULL OR quantity_kg >= 0),
  ADD COLUMN IF NOT EXISTS campaign_year     TEXT,
  ADD COLUMN IF NOT EXISTS source            TEXT DEFAULT 'manual';

-- Backfill member_id/cooperative_id depuis parcelles
UPDATE productions p
SET
  member_id      = pa.member_id,
  cooperative_id = pa.cooperative_id
FROM parcelles pa
WHERE p.parcelle_id = pa.id
  AND p.member_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_productions_member     ON productions(member_id);
CREATE INDEX IF NOT EXISTS idx_productions_coop       ON productions(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_productions_culture    ON productions(culture_name);
CREATE INDEX IF NOT EXISTS idx_productions_campaign   ON productions(campaign_year);
