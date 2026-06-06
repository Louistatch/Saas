-- Seasons table (campagnes agricoles)
CREATE TABLE IF NOT EXISTS campagnes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  culture TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  target_yield_kg NUMERIC,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Farm journal entries (journal de bord)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  campagne_id UUID REFERENCES campagnes(id) ON DELETE SET NULL,
  parcelle_id UUID REFERENCES parcelles(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('travaux','intrant','météo','observation','récolte','vente','autre')),
  title TEXT NOT NULL,
  body TEXT,
  quantity NUMERIC,
  unit TEXT,
  cost_fcfa NUMERIC,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Intrants (inputs: seeds, fertilizers, pesticides)
CREATE TABLE IF NOT EXISTS intrants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  campagne_id UUID REFERENCES campagnes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('semence','engrais','pesticide','outil','autre')),
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  cost_fcfa NUMERIC,
  purchase_date DATE DEFAULT CURRENT_DATE,
  supplier TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_member ON journal_entries(member_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_coop ON journal_entries(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_intrants_member ON intrants(member_id);
CREATE INDEX IF NOT EXISTS idx_campagnes_coop ON campagnes(cooperative_id);

ALTER TABLE campagnes ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intrants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campagnes own coop" ON campagnes FOR ALL USING (
  cooperative_id IN (SELECT id FROM cooperatives WHERE id = cooperative_id)
);
CREATE POLICY "journal own coop" ON journal_entries FOR ALL USING (
  cooperative_id IN (SELECT id FROM cooperatives WHERE id = cooperative_id)
);
CREATE POLICY "intrants own coop" ON intrants FOR ALL USING (
  cooperative_id IN (SELECT id FROM cooperatives WHERE id = cooperative_id)
);
