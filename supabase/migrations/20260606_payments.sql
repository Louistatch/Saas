CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  cotisation_id UUID REFERENCES cotisations(id) ON DELETE SET NULL,
  amount_fcfa NUMERIC NOT NULL CHECK (amount_fcfa > 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  provider TEXT NOT NULL DEFAULT 'orange_money' CHECK (provider IN ('orange_money','moov','tmoney','cash')),
  phone TEXT,
  reference TEXT UNIQUE,
  provider_tx_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','failed','refunded')),
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_coop ON payments(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments own coop" ON payments FOR SELECT USING (
  cooperative_id IN (SELECT id FROM cooperatives WHERE id = cooperative_id)
);
CREATE POLICY "payments service role all" ON payments FOR ALL USING (auth.role() = 'service_role');
