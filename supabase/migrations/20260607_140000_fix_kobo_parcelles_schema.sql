-- Corrective migration: align the `parcelles` table with the columns the
-- frontend (dashboard + public verify pages) and lib/kobo/enrollment.ts
-- have always expected (soil_type, irrigation_type, source), and extend
-- process_kobo_submission() to populate them from Kobo S4 repeat groups —
-- so each synced datum is actually findable where the UI looks for it.

ALTER TABLE parcelles
  ADD COLUMN IF NOT EXISTS soil_type TEXT,
  ADD COLUMN IF NOT EXISTS irrigation_type TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'kobo';

-- `productions` was created with only (id, parcelle_id NOT NULL, campaign, created_at) —
-- neither the Kobo sync trigger, lib/kobo/enrollment.ts, nor the dashboard's
-- /dashboard/parcelles page can read/write the columns they all reference
-- (member_id, cooperative_id, culture_name, quantity_kg, campaign_year, source).
-- Kobo harvest submissions are not always tied to one specific parcelle, so
-- relax `parcelle_id` to nullable and add the columns the app actually uses.
ALTER TABLE productions
  ALTER COLUMN parcelle_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cooperative_id UUID REFERENCES cooperatives(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS culture_name TEXT,
  ADD COLUMN IF NOT EXISTS quantity_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS campaign_year TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'kobo';

CREATE INDEX IF NOT EXISTS idx_productions_cooperative ON productions(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_productions_member ON productions(member_id);

CREATE OR REPLACE FUNCTION process_kobo_submission(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submission kobo_submissions%ROWTYPE;
  v_mapping RECORD;
  v_payload jsonb;
  v_result jsonb;
  v_inserted_parcelles integer := 0;
  v_inserted_productions integer := 0;
  v_culture text;
  v_superficie numeric;
  v_type_sol text;
  v_irrigation text;
  v_culture_produite text;
  v_rendement numeric;
  v_campagne text;
BEGIN
  -- Get the submission
  SELECT * INTO v_submission
  FROM kobo_submissions
  WHERE id = p_submission_id;

  IF v_submission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  IF v_submission.member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matched member');
  END IF;

  v_payload := v_submission.raw_payload;

  -- Extract culture data from repeat groups if present
  -- KoboCollect stores repeats as JSON arrays
  IF v_payload ? 'S4' AND jsonb_typeof(v_payload->'S4') = 'array' THEN
    FOR v_mapping IN
      SELECT * FROM jsonb_array_elements(v_payload->'S4')
    LOOP
      v_culture := v_mapping.value->>'culture_nom';
      v_superficie := (v_mapping.value->>'superficie_culture')::numeric;
      v_type_sol := v_mapping.value->>'type_sol';
      v_irrigation := v_mapping.value->>'irrigation';

      IF v_culture IS NOT NULL THEN
        INSERT INTO parcelles (member_id, cooperative_id, name, culture_principale, superficie_ha, soil_type, irrigation_type, source)
        VALUES (
          v_submission.member_id,
          v_submission.cooperative_id,
          'Parcelle ' || v_culture,
          v_culture,
          v_superficie,
          v_type_sol,
          v_irrigation,
          'kobo'
        )
        ON CONFLICT DO NOTHING;
        v_inserted_parcelles := v_inserted_parcelles + 1;
      END IF;
    END LOOP;
  END IF;

  -- Extract production data from repeat groups if present.
  -- Column names (culture_name/quantity_kg/campaign_year/source) match what
  -- lib/kobo/enrollment.ts and the /dashboard/parcelles UI read & write —
  -- keeping every Kobo ingestion path consistent with the consuming frontend.
  IF v_payload ? 'S5' AND jsonb_typeof(v_payload->'S5') = 'array' THEN
    FOR v_mapping IN
      SELECT * FROM jsonb_array_elements(v_payload->'S5')
    LOOP
      v_culture_produite := v_mapping.value->>'culture_produite';
      v_rendement := (v_mapping.value->>'rendement_kg')::numeric;
      v_campagne := COALESCE(v_mapping.value->>'campagne_annee', EXTRACT(YEAR FROM now())::text);

      IF v_culture_produite IS NOT NULL AND v_rendement IS NOT NULL THEN
        INSERT INTO productions (member_id, cooperative_id, culture_name, quantity_kg, campaign_year, source)
        VALUES (
          v_submission.member_id,
          v_submission.cooperative_id,
          v_culture_produite,
          v_rendement,
          v_campagne,
          'kobo'
        )
        ON CONFLICT DO NOTHING;
        v_inserted_productions := v_inserted_productions + 1;
      END IF;
    END LOOP;
  END IF;

  -- Mark as processed
  UPDATE kobo_submissions
  SET status = 'matched',
      processed_payload = jsonb_build_object(
        'parcelles_inserted', v_inserted_parcelles,
        'productions_inserted', v_inserted_productions
      ),
      processed_at = now(),
      updated_at = now()
  WHERE id = p_submission_id;

  v_result := jsonb_build_object(
    'success', true,
    'matched', true,
    'inserted_parcelles', v_inserted_parcelles,
    'inserted_productions', v_inserted_productions
  );

  RETURN v_result;
END;
$$;

-- The original migration scheduled pg_cron purge jobs against `kobo_sync_queue`,
-- but that table was never created — those cron jobs fail at execution time.
-- Create the missing table so the existing schedules become valid.
CREATE TABLE IF NOT EXISTS kobo_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID REFERENCES cooperatives(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload JSONB,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kobo_sync_queue_status ON kobo_sync_queue(status);

ALTER TABLE kobo_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kobo sync queue readable by own coop" ON kobo_sync_queue
  FOR SELECT USING (
    cooperative_id = ANY(get_accessible_cooperative_ids())
  );
