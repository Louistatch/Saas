-- =============================================================================
-- 20260605_100000_market_prices.sql
--
-- Table market_prices : prix de marché soumis par les membres producteurs.
--
-- Fonctionnalités :
--   - Les membres vérifient et soumettent les prix via la page /verify
--   - Les prix sont filtrables par région, préfecture, canton, culture
--   - Réalimentation possible via Kobo (webhook)
--   - Lecture publique (anon) — écriture par les membres authentifiés + service_role
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.market_prices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id      uuid        NOT NULL REFERENCES public.cultures(id) ON DELETE CASCADE,
  region_id       uuid        NOT NULL REFERENCES public.regions(id)  ON DELETE CASCADE,
  prefecture_id   uuid        REFERENCES public.prefectures(id) ON DELETE SET NULL,
  canton_id       uuid        REFERENCES public.cantons(id)     ON DELETE SET NULL,
  market_name     text        NOT NULL,
  price           numeric(10,0) NOT NULL CHECK (price > 0 AND price <= 100000),
  unit            text        NOT NULL DEFAULT 'kg',
  currency        text        NOT NULL DEFAULT 'FCFA',
  trend           text        NOT NULL DEFAULT 'stable' CHECK (trend IN ('up', 'down', 'stable')),
  verified        boolean     NOT NULL DEFAULT false,
  reported_by     uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  cooperative_id  uuid        REFERENCES public.cooperatives(id) ON DELETE SET NULL,
  source          text        DEFAULT 'manual' CHECK (source IN ('manual', 'kobo', 'admin')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_market_prices_region    ON public.market_prices (region_id);
CREATE INDEX IF NOT EXISTS idx_market_prices_canton    ON public.market_prices (canton_id);
CREATE INDEX IF NOT EXISTS idx_market_prices_culture   ON public.market_prices (culture_id);
CREATE INDEX IF NOT EXISTS idx_market_prices_created   ON public.market_prices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_prices_verified  ON public.market_prices (verified) WHERE verified = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_market_prices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_market_prices_updated_at ON public.market_prices;
CREATE TRIGGER trg_market_prices_updated_at
  BEFORE UPDATE ON public.market_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_market_prices_updated_at();

-- RLS
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;

-- Anyone can read prices (public verify page, no auth required)
CREATE POLICY "Public read market_prices"
  ON public.market_prices FOR SELECT
  USING (true);

-- Authenticated members can insert their own price reports
CREATE POLICY "Members insert market_prices"
  ON public.market_prices FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid() OR reported_by IS NULL);

-- Cooperative admins can update/delete prices for their cooperative
CREATE POLICY "Coop admin update market_prices"
  ON public.market_prices FOR UPDATE
  TO authenticated
  USING (
    cooperative_id IN (
      SELECT cooperative_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Coop admin delete market_prices"
  ON public.market_prices FOR DELETE
  TO authenticated
  USING (
    cooperative_id IN (
      SELECT cooperative_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Service role can do everything (Kobo webhook, admin tools)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_prices TO service_role;
GRANT SELECT ON public.market_prices TO anon, authenticated;
GRANT INSERT ON public.market_prices TO authenticated;

COMMENT ON TABLE public.market_prices IS
  'Prix de marché agricoles soumis par les membres ou importés via Kobo.';

-- =============================================================================
-- Seed : prix initiaux pour les 5 régions du Togo
-- IDs correspondent aux seeds dans 20260524_full_schema_alignment.sql
-- =============================================================================
DO $$
DECLARE
  -- Région IDs (depuis le seed existant)
  r_maritime  uuid := 'b0f3fef0-032d-4566-9b97-89d9efcbe23b';
  r_plateaux  uuid := '913db44f-9095-4ee0-8574-8ecbfad47a4a';
  r_centrale  uuid := '1fba6fc3-28e8-48f7-bf3e-774fce7bd9f0';
  r_kara      uuid := 'e7becd6d-4f6e-4cb9-9f4d-f70d736800b1';
  r_savanes   uuid := '801137e4-e990-4dc7-83f6-db4d9b41c42d';

  -- Culture IDs
  c_tomate    uuid := '90b9f0cf-c879-4ac4-b3f7-98c5f2e712b7';
  c_oignon    uuid := 'c2891f71-e3d8-4f08-b5ac-992bce1ddff4';
  c_piment    uuid := '3cb519af-7572-499e-ab58-83655f05825a';
  c_gombo     uuid := '478432bd-83c8-4923-8aa2-ceb686c0bc1e';
BEGIN
  -- Vérifie que les IDs régions existent avant d'insérer
  IF EXISTS (SELECT 1 FROM public.regions WHERE id = r_maritime) THEN
    INSERT INTO public.market_prices (culture_id, region_id, market_name, price, trend, verified, source)
    VALUES
      (c_tomate, r_maritime, 'Lomé-Adawlato',   350, 'stable', true, 'admin'),
      (c_oignon, r_maritime, 'Lomé-Adawlato',   200, 'up',     true, 'admin'),
      (c_piment, r_maritime, 'Lomé-Adawlato',   450, 'down',   true, 'admin'),
      (c_gombo,  r_maritime, 'Lomé-Adawlato',   300, 'stable', true, 'admin'),
      (c_tomate, r_plateaux, 'Atakpamé',        300, 'stable', true, 'admin'),
      (c_oignon, r_plateaux, 'Atakpamé',        180, 'stable', true, 'admin'),
      (c_tomate, r_centrale, 'Sokodé',           280, 'up',    true, 'admin'),
      (c_oignon, r_centrale, 'Sokodé',           175, 'stable', true, 'admin'),
      (c_tomate, r_kara,     'Kara',             260, 'stable', true, 'admin'),
      (c_piment, r_kara,     'Kara',             400, 'up',     true, 'admin'),
      (c_tomate, r_savanes,  'Dapaong',          240, 'down',   true, 'admin'),
      (c_oignon, r_savanes,  'Dapaong',          160, 'stable', true, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
