-- Table to store ATS history
CREATE TABLE IF NOT EXISTS member_ats_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 1000),
  -- Breakdown
  cotisation_score INTEGER DEFAULT 0,  -- 0-300
  production_score INTEGER DEFAULT 0,  -- 0-300
  engagement_score INTEGER DEFAULT 0,  -- 0-200 (scans + card active)
  anciennete_score INTEGER DEFAULT 0,  -- 0-100
  parcelle_score INTEGER DEFAULT 0,    -- 0-100
  -- Level
  level TEXT GENERATED ALWAYS AS (
    CASE
      WHEN score >= 800 THEN 'platinum'
      WHEN score >= 600 THEN 'gold'
      WHEN score >= 400 THEN 'silver'
      WHEN score >= 200 THEN 'bronze'
      ELSE 'starter'
    END
  ) STORED,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_member_ats_member_id ON member_ats_scores(member_id);
CREATE INDEX IF NOT EXISTS idx_member_ats_cooperative_id ON member_ats_scores(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_member_ats_calculated ON member_ats_scores(calculated_at DESC);

-- RLS
ALTER TABLE member_ats_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cooperative members can read own ats" ON member_ats_scores
  FOR SELECT USING (
    cooperative_id IN (
      SELECT id FROM cooperatives WHERE id = cooperative_id
    )
  );

CREATE POLICY "service role can insert ats" ON member_ats_scores
  FOR ALL USING (auth.role() = 'service_role');

-- Function to calculate ATS for a member
CREATE OR REPLACE FUNCTION calculate_member_ats(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_cotisation_score INTEGER := 0;
  v_production_score INTEGER := 0;
  v_engagement_score INTEGER := 0;
  v_anciennete_score INTEGER := 0;
  v_parcelle_score INTEGER := 0;
  v_total INTEGER := 0;
  v_cotisations_total INTEGER := 0;
  v_cotisations_paid INTEGER := 0;
  v_total_kg NUMERIC := 0;
  v_nb_parcelles INTEGER := 0;
  v_surface_ha NUMERIC := 0;
  v_scan_count INTEGER := 0;
  v_card_active BOOLEAN := false;
  v_months_member INTEGER := 0;
BEGIN
  -- Get member info
  SELECT * INTO v_member FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- 1. COTISATION SCORE (0-300)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'paid')
  INTO v_cotisations_total, v_cotisations_paid
  FROM cotisations WHERE member_id = p_member_id;

  IF v_cotisations_total > 0 THEN
    v_cotisation_score := LEAST(300, ROUND(
      (v_cotisations_paid::NUMERIC / v_cotisations_total) * 200
      + LEAST(100, v_cotisations_paid * 20)
    ));
  END IF;

  -- 2. PRODUCTION SCORE (0-300)
  SELECT COALESCE(SUM(quantity_kg), 0) INTO v_total_kg
  FROM productions WHERE member_id = p_member_id;

  v_production_score := LEAST(300, ROUND(
    CASE
      WHEN v_total_kg >= 10000 THEN 300
      WHEN v_total_kg >= 5000  THEN 200
      WHEN v_total_kg >= 1000  THEN 150
      WHEN v_total_kg >= 500   THEN 100
      WHEN v_total_kg >= 100   THEN 60
      WHEN v_total_kg > 0      THEN 30
      ELSE 0
    END
  ));

  -- 3. ENGAGEMENT SCORE (0-200)
  SELECT COUNT(*) INTO v_scan_count
  FROM member_access_logs
  WHERE member_id = p_member_id AND action = 'scan'
  AND created_at > now() - INTERVAL '90 days';

  SELECT EXISTS(
    SELECT 1 FROM member_cards WHERE member_id = p_member_id AND status = 'active'
  ) INTO v_card_active;

  v_engagement_score := LEAST(200,
    CASE WHEN v_card_active THEN 50 ELSE 0 END
    + LEAST(100, v_scan_count * 10)
    + CASE WHEN v_member.status = 'active' THEN 50 ELSE 0 END
  );

  -- 4. ANCIENNETÉ SCORE (0-100)
  v_months_member := GREATEST(0, EXTRACT(MONTH FROM AGE(now(), v_member.created_at))
    + EXTRACT(YEAR FROM AGE(now(), v_member.created_at)) * 12);

  v_anciennete_score := LEAST(100, v_months_member * 5);

  -- 5. PARCELLE SCORE (0-100)
  SELECT COUNT(*), COALESCE(SUM(surface_ha), 0)
  INTO v_nb_parcelles, v_surface_ha
  FROM parcelles WHERE member_id = p_member_id;

  v_parcelle_score := LEAST(100,
    v_nb_parcelles * 20 + LEAST(60, ROUND(v_surface_ha * 10))
  );

  v_total := v_cotisation_score + v_production_score + v_engagement_score
           + v_anciennete_score + v_parcelle_score;

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'score', v_total,
    'level', CASE
      WHEN v_total >= 800 THEN 'platinum'
      WHEN v_total >= 600 THEN 'gold'
      WHEN v_total >= 400 THEN 'silver'
      WHEN v_total >= 200 THEN 'bronze'
      ELSE 'starter'
    END,
    'breakdown', jsonb_build_object(
      'cotisation', v_cotisation_score,
      'production', v_production_score,
      'engagement', v_engagement_score,
      'anciennete', v_anciennete_score,
      'parcelle', v_parcelle_score
    )
  );
END;
$$;

-- Function to recalculate and persist ATS for a member
CREATE OR REPLACE FUNCTION upsert_member_ats(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_coop_id UUID;
BEGIN
  SELECT cooperative_id INTO v_coop_id FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_result := calculate_member_ats(p_member_id);
  IF v_result IS NULL THEN RETURN; END IF;

  INSERT INTO member_ats_scores (
    member_id, cooperative_id, score,
    cotisation_score, production_score, engagement_score,
    anciennete_score, parcelle_score, calculated_at
  ) VALUES (
    p_member_id, v_coop_id,
    (v_result->>'score')::INTEGER,
    (v_result->'breakdown'->>'cotisation')::INTEGER,
    (v_result->'breakdown'->>'production')::INTEGER,
    (v_result->'breakdown'->>'engagement')::INTEGER,
    (v_result->'breakdown'->>'anciennete')::INTEGER,
    (v_result->'breakdown'->>'parcelle')::INTEGER,
    now()
  )
  ON CONFLICT DO NOTHING;
END;
$$;
