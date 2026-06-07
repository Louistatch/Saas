-- Producer-side announcements: job offers, pre-sales and other Haroo-related posts
-- created inline from "Mon Exploitation" in the card-verification flow.
CREATE TABLE IF NOT EXISTS producer_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('job', 'prevente', 'autre')),
  title TEXT NOT NULL,
  description TEXT,
  culture TEXT,
  quantity_kg NUMERIC CHECK (quantity_kg IS NULL OR quantity_kg > 0),
  price_per_kg_fcfa NUMERIC CHECK (price_per_kg_fcfa IS NULL OR price_per_kg_fcfa > 0),
  location_canton TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producer_announcements_member ON producer_announcements(member_id);
CREATE INDEX IF NOT EXISTS idx_producer_announcements_coop_type ON producer_announcements(cooperative_id, type, status);

ALTER TABLE producer_announcements ENABLE ROW LEVEL SECURITY;

-- Readable by authenticated users of the same cooperative (workers/buyers browse via dashboard views)
CREATE POLICY "announcements readable by own coop" ON producer_announcements
  FOR SELECT TO authenticated USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE cooperative_id = producer_announcements.cooperative_id
    )
  );

-- Inserts/updates/deletes go through the service-role client in /api/verify routes
-- (the card-verification flow is anonymous and not backed by a Supabase auth session).
CREATE POLICY "announcements update own coop" ON producer_announcements
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE cooperative_id = producer_announcements.cooperative_id
    )
  );

CREATE POLICY "announcements delete own coop" ON producer_announcements
  FOR DELETE USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE cooperative_id = producer_announcements.cooperative_id
    )
  );
