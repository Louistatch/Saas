ALTER TABLE parcelles
  ADD COLUMN IF NOT EXISTS soil_type       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS irrigation_type text DEFAULT NULL;
