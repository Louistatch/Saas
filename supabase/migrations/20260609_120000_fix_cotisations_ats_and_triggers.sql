-- ═══════════════════════════════════════════════════════════════════════
-- CORRECTION SCHÉMA — cotisations : 6 colonnes manquantes
-- Impact : module cotisations dashboard cassé (paid_date, due_date, etc.)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.cotisations
  ADD COLUMN IF NOT EXISTS paid_date        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS type             TEXT DEFAULT 'membership'
                                              CHECK (type IN ('membership', 'special', 'penalite', 'autre')),
  ADD COLUMN IF NOT EXISTS currency         TEXT NOT NULL DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

CREATE INDEX IF NOT EXISTS idx_cotisations_due_date
  ON public.cotisations(due_date);
CREATE INDEX IF NOT EXISTS idx_cotisations_status_member
  ON public.cotisations(status, member_id);

-- ═══════════════════════════════════════════════════════════════════════
-- CORRECTION INTÉGRITÉ — member_ats_scores : UNIQUE manquant sur member_id
-- Impact : ON CONFLICT ne déclenchait jamais → lignes en double infinies
-- ═══════════════════════════════════════════════════════════════════════
DELETE FROM public.member_ats_scores a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (member_id) id
  FROM public.member_ats_scores
  ORDER BY member_id, calculated_at DESC NULLS LAST
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_ats_scores_member_unique
  ON public.member_ats_scores(member_id);

-- ── upsert_member_ats : ON CONFLICT correct ───────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_member_ats(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result   JSONB;
  v_coop_id  UUID;
BEGIN
  SELECT cooperative_id INTO v_coop_id
  FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_result := calculate_member_ats(p_member_id);
  IF v_result IS NULL THEN RETURN; END IF;

  INSERT INTO member_ats_scores (
    member_id, cooperative_id, score,
    cotisation_score, production_score, engagement_score,
    anciennete_score, parcelle_score, calculated_at
  ) VALUES (
    p_member_id,
    v_coop_id,
    (v_result->>'score')::INTEGER,
    (v_result->'breakdown'->>'cotisation')::INTEGER,
    (v_result->'breakdown'->>'production')::INTEGER,
    (v_result->'breakdown'->>'engagement')::INTEGER,
    (v_result->'breakdown'->>'anciennete')::INTEGER,
    (v_result->'breakdown'->>'parcelle')::INTEGER,
    now()
  )
  ON CONFLICT (member_id) DO UPDATE SET
    cooperative_id   = EXCLUDED.cooperative_id,
    score            = EXCLUDED.score,
    cotisation_score = EXCLUDED.cotisation_score,
    production_score = EXCLUDED.production_score,
    engagement_score = EXCLUDED.engagement_score,
    anciennete_score = EXCLUDED.anciennete_score,
    parcelle_score   = EXCLUDED.parcelle_score,
    calculated_at    = EXCLUDED.calculated_at;
END;
$$;

-- ── calculate_member_ats : correction superficie_ha / surface_ha ──────
-- Deux colonnes coexistent après migration add_missing_columns.
-- On utilise COALESCE(superficie_ha, surface_ha) pour compatibilité.
CREATE OR REPLACE FUNCTION public.calculate_member_ats(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member            RECORD;
  v_cotisation_score  INTEGER := 0;
  v_production_score  INTEGER := 0;
  v_engagement_score  INTEGER := 0;
  v_anciennete_score  INTEGER := 0;
  v_parcelle_score    INTEGER := 0;
  v_total             INTEGER := 0;
  v_cotisations_total INTEGER := 0;
  v_cotisations_paid  INTEGER := 0;
  v_total_kg          NUMERIC := 0;
  v_nb_parcelles      INTEGER := 0;
  v_surface_ha        NUMERIC := 0;
  v_scan_count        INTEGER := 0;
  v_card_active       BOOLEAN := false;
  v_months_member     INTEGER := 0;
BEGIN
  SELECT * INTO v_member FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- 1. COTISATION (0-300)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'paid')
  INTO v_cotisations_total, v_cotisations_paid
  FROM cotisations WHERE member_id = p_member_id;

  IF v_cotisations_total > 0 THEN
    v_cotisation_score := LEAST(300, ROUND(
      (v_cotisations_paid::NUMERIC / v_cotisations_total) * 200
      + LEAST(100, v_cotisations_paid * 20)
    ));
  END IF;

  -- 2. PRODUCTION (0-300)
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

  -- 3. ENGAGEMENT (0-200)
  SELECT COUNT(*) INTO v_scan_count
  FROM member_access_logs
  WHERE member_id = p_member_id AND action = 'scan'
    AND created_at > now() - INTERVAL '90 days';

  SELECT EXISTS(
    SELECT 1 FROM member_cards
    WHERE member_id = p_member_id AND status = 'active'
  ) INTO v_card_active;

  v_engagement_score := LEAST(200,
    CASE WHEN v_card_active THEN 50 ELSE 0 END
    + LEAST(100, v_scan_count * 10)
    + CASE WHEN v_member.status = 'active' THEN 50 ELSE 0 END
  );

  -- 4. ANCIENNETÉ (0-100)
  v_months_member := GREATEST(0,
    EXTRACT(MONTH FROM AGE(now(), v_member.created_at))::INTEGER
    + (EXTRACT(YEAR FROM AGE(now(), v_member.created_at))::INTEGER * 12)
  );
  v_anciennete_score := LEAST(100, v_months_member * 5);

  -- 5. PARCELLE (0-100) — COALESCE pour compatibilité superficie_ha / surface_ha
  SELECT
    COUNT(*),
    COALESCE(SUM(COALESCE(superficie_ha, surface_ha)), 0)
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
      'cotisation',  v_cotisation_score,
      'production',  v_production_score,
      'engagement',  v_engagement_score,
      'anciennete',  v_anciennete_score,
      'parcelle',    v_parcelle_score
    )
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- TRIGGER — recalcul ATS automatique à chaque paiement de cotisation
-- Ferme la boucle : Cotisation payée → Score mis à jour automatiquement
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trigger_recalc_ats_on_cotisation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM upsert_member_ats(NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cotisation_paid_recalc_ats ON public.cotisations;
CREATE TRIGGER trg_cotisation_paid_recalc_ats
  AFTER UPDATE OF status ON public.cotisations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalc_ats_on_cotisation();

NOTIFY pgrst, 'reload schema';
