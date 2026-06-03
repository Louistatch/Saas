-- =====================================================
-- weather_data : données climatiques réelles
-- Sources : NASA POWER (historique) + Open-Meteo (prévisions)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.weather_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  region TEXT,
  date DATE NOT NULL,
  -- Température
  temperature_max DECIMAL(5,2),
  temperature_min DECIMAL(5,2),
  temperature_mean DECIMAL(5,2),
  -- Précipitations
  precipitation_mm DECIMAL(8,2),
  -- Radiation solaire
  solar_radiation_mj DECIMAL(8,3),
  -- Humidité & vent
  humidity_pct DECIMAL(5,2),
  wind_speed_ms DECIMAL(5,2),
  -- Évapotranspiration (crucial pour l'irrigation)
  et0_mm DECIMAL(8,2),
  -- Métadonnées
  source TEXT NOT NULL CHECK (source IN ('nasa_power', 'open_meteo', 'kobo')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (latitude, longitude, date, source)
);

-- Index pour les requêtes ML (par région + date)
CREATE INDEX IF NOT EXISTS idx_weather_region_date ON public.weather_data (region, date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_coords ON public.weather_data (latitude, longitude, date DESC);

-- RLS
ALTER TABLE public.weather_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weather_read_all" ON public.weather_data FOR SELECT USING (true);
CREATE POLICY "weather_insert_service" ON public.weather_data FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.weather_data IS 'Données climatiques réelles (NASA POWER + Open-Meteo). Utilisées par les modèles ML AgriTogo.';
