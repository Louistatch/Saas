-- Buyer demand requests
CREATE TABLE IF NOT EXISTS buyer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID REFERENCES cooperatives(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_email TEXT,
  culture TEXT NOT NULL,
  quantity_kg_needed NUMERIC NOT NULL CHECK (quantity_kg_needed > 0),
  max_price_per_kg_fcfa NUMERIC,
  quality_grade_min TEXT CHECK (quality_grade_min IN ('A','B','C')),
  location_prefecture TEXT,
  needed_by DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','fulfilled','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Match records (linking buyer requests to listings)
CREATE TABLE IF NOT EXISTS buyer_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES buyer_requests(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  match_reason TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected','completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(request_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_buyer_requests_culture ON buyer_requests(culture, status);
CREATE INDEX IF NOT EXISTS idx_buyer_matches_request ON buyer_matches(request_id);
CREATE INDEX IF NOT EXISTS idx_buyer_matches_listing ON buyer_matches(listing_id);

ALTER TABLE buyer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer_requests auth read" ON buyer_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "buyer_requests auth insert" ON buyer_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "buyer_requests auth update" ON buyer_requests FOR UPDATE TO authenticated USING (true);
CREATE POLICY "buyer_matches auth read" ON buyer_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "buyer_matches service all" ON buyer_matches FOR ALL USING (auth.role() = 'service_role');
