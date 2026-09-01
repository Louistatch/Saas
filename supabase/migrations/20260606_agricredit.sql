CREATE TABLE IF NOT EXISTS credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  amount_requested_fcfa NUMERIC NOT NULL CHECK (amount_requested_fcfa > 0),
  purpose TEXT NOT NULL CHECK (purpose IN ('semences','engrais','equipement','irrigation','stockage','autre')),
  duration_months INTEGER NOT NULL CHECK (duration_months IN (3,6,12,18,24)),
  ats_score_at_application INTEGER,
  credit_score INTEGER,
  credit_grade TEXT CHECK (credit_grade IN ('A','B','C','D','F')),
  amount_approved_fcfa NUMERIC,
  interest_rate_pct NUMERIC DEFAULT 8.0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scoring','approved','rejected','disbursed','repaying','closed','defaulted')),
  rejection_reason TEXT,
  notes TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  disbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES credit_applications(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount_due_fcfa NUMERIC NOT NULL,
  amount_paid_fcfa NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','overdue')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_member ON credit_applications(member_id);
CREATE INDEX IF NOT EXISTS idx_credit_coop ON credit_applications(cooperative_id, status);
CREATE INDEX IF NOT EXISTS idx_repayments_app ON credit_repayments(application_id, due_date);

ALTER TABLE credit_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit own coop" ON credit_applications FOR ALL USING (
  cooperative_id IN (SELECT cooperative_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "repayments via app" ON credit_repayments FOR ALL USING (
  application_id IN (SELECT id FROM credit_applications WHERE cooperative_id IN (
    SELECT cooperative_id FROM profiles WHERE id = auth.uid()
  ))
);
