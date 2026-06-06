CREATE TABLE IF NOT EXISTS market_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  culture TEXT NOT NULL,
  quantity_kg NUMERIC NOT NULL CHECK (quantity_kg > 0),
  price_per_kg_fcfa NUMERIC NOT NULL CHECK (price_per_kg_fcfa > 0),
  quality_grade TEXT CHECK (quality_grade IN ('A','B','C')) DEFAULT 'B',
  harvest_date_estimated DATE,
  location_canton TEXT,
  location_prefecture TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','expired','cancelled')),
  views_count INTEGER DEFAULT 0,
  contact_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_listings_coop ON market_listings(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_market_listings_culture ON market_listings(culture);

ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read listings
CREATE POLICY "listings readable by authenticated" ON market_listings
  FOR SELECT TO authenticated USING (true);

-- Only users in the same cooperative can insert
CREATE POLICY "listings insert own coop" ON market_listings
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE cooperative_id = market_listings.cooperative_id
    )
  );

CREATE POLICY "listings update own coop" ON market_listings
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE cooperative_id = market_listings.cooperative_id
    )
  );

CREATE POLICY "listings delete own coop" ON market_listings
  FOR DELETE USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE cooperative_id = market_listings.cooperative_id
    )
  );
