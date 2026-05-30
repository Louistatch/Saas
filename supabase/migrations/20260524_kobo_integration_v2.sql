-- Migration: KoboCollect Integration v2 — Full pipeline tables, functions, triggers, RLS
-- ======================================================================================
-- Adds:
--   * kobo_submissions — stores raw + processed Kobo submissions
--   * kobo_sync_logs — audit trail for sync operations
--   * kobo_field_mappings — configurable field mapping per form
--   * match_kobo_submission_to_member() — auto-matching by card_number
--   * process_kobo_submission() — extracts fields and upserts parcelles/productions
--   * get_kobo_stats() — per-cooperative stats RPC
--   * Triggers: updated_at, notify on new submission
--   * pg_cron: purge old error/completed records
--
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).

-- =========================================================
-- 1. kobo_submissions
-- =========================================================
CREATE TABLE IF NOT EXISTS kobo_submissions (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cooperative_id      uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  member_id           uuid REFERENCES members(id) ON DELETE SET NULL,
  kobo_instance_id    text UNIQUE NOT NULL,
  kobo_form_id        text NOT NULL,
  raw_payload         jsonb NOT NULL,
  processed_payload   jsonb,
  member_card_number  text,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','matched','unmatched','error','duplicate')),
  error_message       text,
  matched_at          timestamptz,
  processed_at        timestamptz,
  submitted_at        timestamptz NOT NULL,
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE kobo_submissions IS
  'Stores raw and processed KoboCollect submissions for the data pipeline.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_cooperative_id
  ON kobo_submissions(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_member_id
  ON kobo_submissions(member_id);
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_status
  ON kobo_submissions(status);
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_kobo_instance_id
  ON kobo_submissions(kobo_instance_id);
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_submitted_at
  ON kobo_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_card_number
  ON kobo_submissions(member_card_number);
CREATE INDEX IF NOT EXISTS idx_kobo_submissions_cooperative_status
  ON kobo_submissions(cooperative_id, status);

-- =========================================================
-- 2. kobo_sync_logs
-- =========================================================
CREATE TABLE IF NOT EXISTS kobo_sync_logs (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cooperative_id          uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  integration_id          uuid REFERENCES integrations(id) ON DELETE SET NULL,
  sync_type               text NOT NULL CHECK (sync_type IN ('webhook','pull','manual')),
  status                  text NOT NULL CHECK (status IN ('started','success','partial','failed')),
  submissions_received    integer DEFAULT 0,
  submissions_processed   integer DEFAULT 0,
  submissions_matched     integer DEFAULT 0,
  submissions_errors      integer DEFAULT 0,
  duration_ms             integer,
  error_details           jsonb,
  triggered_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  started_at              timestamptz DEFAULT now() NOT NULL,
  completed_at            timestamptz
);

COMMENT ON TABLE kobo_sync_logs IS
  'Audit trail for all KoboCollect sync operations (webhook, pull, manual).';

CREATE INDEX IF NOT EXISTS idx_kobo_sync_logs_cooperative_id
  ON kobo_sync_logs(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_kobo_sync_logs_status
  ON kobo_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_kobo_sync_logs_started_at
  ON kobo_sync_logs(started_at DESC);

-- =========================================================
-- 3. kobo_field_mappings
-- =========================================================
CREATE TABLE IF NOT EXISTS kobo_field_mappings (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cooperative_id  uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  form_id         text NOT NULL,
  kobo_field      text NOT NULL,
  target_table    text NOT NULL,
  target_column   text NOT NULL,
  transform_fn    text,
  is_key_field    boolean DEFAULT false,
  created_at      timestamptz DEFAULT now() NOT NULL,
  UNIQUE(cooperative_id, form_id, kobo_field)
);

COMMENT ON TABLE kobo_field_mappings IS
  'Configurable mapping from KoboCollect form fields to database columns.';

CREATE INDEX IF NOT EXISTS idx_kobo_field_mappings_cooperative_form
  ON kobo_field_mappings(cooperative_id, form_id);

-- =========================================================
-- RLS — kobo_submissions
-- =========================================================
ALTER TABLE kobo_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kobo_submissions_select" ON kobo_submissions;
CREATE POLICY "kobo_submissions_select"
  ON kobo_submissions FOR SELECT TO authenticated
  USING (cooperative_id = ANY(get_accessible_cooperative_ids()));

DROP POLICY IF EXISTS "kobo_submissions_insert" ON kobo_submissions;
CREATE POLICY "kobo_submissions_insert"
  ON kobo_submissions FOR INSERT TO authenticated
  WITH CHECK (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('cooperative_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "kobo_submissions_update" ON kobo_submissions;
CREATE POLICY "kobo_submissions_update"
  ON kobo_submissions FOR UPDATE TO authenticated
  USING (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id = ANY(get_accessible_cooperative_ids())
  );

DROP POLICY IF EXISTS "kobo_submissions_delete" ON kobo_submissions;
CREATE POLICY "kobo_submissions_delete"
  ON kobo_submissions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin')
    )
    OR (
      cooperative_id = ANY(get_accessible_cooperative_ids())
      AND EXISTS (
        SELECT 1 FROM profiles p
        JOIN cooperatives c ON c.id = p.cooperative_id
        WHERE p.id = auth.uid()
        AND p.role = 'cooperative_admin'
        AND c.level = 'faitiere'
      )
    )
  );

-- =========================================================
-- RLS — kobo_sync_logs
-- =========================================================
ALTER TABLE kobo_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kobo_sync_logs_select" ON kobo_sync_logs;
CREATE POLICY "kobo_sync_logs_select"
  ON kobo_sync_logs FOR SELECT TO authenticated
  USING (cooperative_id = ANY(get_accessible_cooperative_ids()));

DROP POLICY IF EXISTS "kobo_sync_logs_insert" ON kobo_sync_logs;
CREATE POLICY "kobo_sync_logs_insert"
  ON kobo_sync_logs FOR INSERT TO authenticated
  WITH CHECK (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('cooperative_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "kobo_sync_logs_update" ON kobo_sync_logs;
CREATE POLICY "kobo_sync_logs_update"
  ON kobo_sync_logs FOR UPDATE TO authenticated
  USING (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id = ANY(get_accessible_cooperative_ids())
  );

DROP POLICY IF EXISTS "kobo_sync_logs_delete" ON kobo_sync_logs;
CREATE POLICY "kobo_sync_logs_delete"
  ON kobo_sync_logs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- =========================================================
-- RLS — kobo_field_mappings
-- =========================================================
ALTER TABLE kobo_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kobo_field_mappings_select" ON kobo_field_mappings;
CREATE POLICY "kobo_field_mappings_select"
  ON kobo_field_mappings FOR SELECT TO authenticated
  USING (cooperative_id = ANY(get_accessible_cooperative_ids()));

DROP POLICY IF EXISTS "kobo_field_mappings_insert" ON kobo_field_mappings;
CREATE POLICY "kobo_field_mappings_insert"
  ON kobo_field_mappings FOR INSERT TO authenticated
  WITH CHECK (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('cooperative_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "kobo_field_mappings_update" ON kobo_field_mappings;
CREATE POLICY "kobo_field_mappings_update"
  ON kobo_field_mappings FOR UPDATE TO authenticated
  USING (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id = ANY(get_accessible_cooperative_ids())
  );

DROP POLICY IF EXISTS "kobo_field_mappings_delete" ON kobo_field_mappings;
CREATE POLICY "kobo_field_mappings_delete"
  ON kobo_field_mappings FOR DELETE TO authenticated
  USING (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- =========================================================
-- Trigger: updated_at on kobo_submissions
-- =========================================================
CREATE OR REPLACE FUNCTION update_kobo_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kobo_submissions_updated_at ON kobo_submissions;
CREATE TRIGGER kobo_submissions_updated_at
  BEFORE UPDATE ON kobo_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_kobo_submissions_updated_at();

-- =========================================================
-- Trigger: notify on new submission (for Supabase Realtime)
-- =========================================================
CREATE OR REPLACE FUNCTION notify_kobo_new_submission()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'kobo_new_submission',
    json_build_object(
      'id', NEW.id,
      'cooperative_id', NEW.cooperative_id,
      'kobo_instance_id', NEW.kobo_instance_id,
      'status', NEW.status
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kobo_submissions_notify ON kobo_submissions;
CREATE TRIGGER kobo_submissions_notify
  AFTER INSERT ON kobo_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_kobo_new_submission();

-- =========================================================
-- Function: match_kobo_submission_to_member
-- =========================================================
CREATE OR REPLACE FUNCTION match_kobo_submission_to_member(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card_number text;
  v_cooperative_id uuid;
  v_member_id uuid;
BEGIN
  -- Get submission details
  SELECT member_card_number, cooperative_id
  INTO v_card_number, v_cooperative_id
  FROM kobo_submissions
  WHERE id = p_submission_id;

  IF v_card_number IS NULL OR v_card_number = '' THEN
    -- No card number to match — mark as unmatched
    UPDATE kobo_submissions
    SET status = 'unmatched', updated_at = now()
    WHERE id = p_submission_id;
    RETURN;
  END IF;

  -- Try to find member by card_number within the same cooperative
  SELECT m.id INTO v_member_id
  FROM member_cards mc
  JOIN members m ON m.id = mc.member_id
  WHERE mc.card_number = v_card_number
    AND mc.cooperative_id = v_cooperative_id
    AND mc.status = 'active'
  LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    UPDATE kobo_submissions
    SET member_id = v_member_id,
        status = 'matched',
        matched_at = now(),
        updated_at = now()
    WHERE id = p_submission_id;
  ELSE
    UPDATE kobo_submissions
    SET status = 'unmatched', updated_at = now()
    WHERE id = p_submission_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION match_kobo_submission_to_member IS
  'Attempts to match a Kobo submission to a member via card_number. Updates status accordingly.';

REVOKE ALL ON FUNCTION match_kobo_submission_to_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_kobo_submission_to_member(uuid) TO authenticated;

-- =========================================================
-- Function: process_kobo_submission
-- =========================================================
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
  v_rendement numeric;
  v_prix numeric;
  v_campagne integer;
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

      IF v_culture IS NOT NULL THEN
        INSERT INTO parcelles (member_id, cooperative_id, name, culture_principale, superficie_ha)
        VALUES (
          v_submission.member_id,
          v_submission.cooperative_id,
          'Parcelle ' || v_culture,
          v_culture,
          v_superficie
        )
        ON CONFLICT DO NOTHING;
        v_inserted_parcelles := v_inserted_parcelles + 1;
      END IF;
    END LOOP;
  END IF;

  -- Extract production data from repeat groups if present
  IF v_payload ? 'S5' AND jsonb_typeof(v_payload->'S5') = 'array' THEN
    FOR v_mapping IN
      SELECT * FROM jsonb_array_elements(v_payload->'S5')
    LOOP
      v_rendement := (v_mapping.value->>'rendement_kg')::numeric;
      v_prix := (v_mapping.value->>'prix_vente_moyen')::numeric;
      v_campagne := (v_mapping.value->>'campagne_annee')::integer;

      IF v_rendement IS NOT NULL THEN
        INSERT INTO productions (member_id, cooperative_id, campagne_annee, rendement_kg, prix_vente_fcfa)
        VALUES (
          v_submission.member_id,
          v_submission.cooperative_id,
          COALESCE(v_campagne, EXTRACT(YEAR FROM now())::integer),
          v_rendement,
          v_prix
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

COMMENT ON FUNCTION process_kobo_submission IS
  'Extracts fields from raw_payload using field mappings and upserts into parcelles/productions.';

REVOKE ALL ON FUNCTION process_kobo_submission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_kobo_submission(uuid) TO authenticated;

-- =========================================================
-- Function: get_kobo_stats
-- =========================================================
CREATE OR REPLACE FUNCTION get_kobo_stats(p_cooperative_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_accessible uuid[];
BEGIN
  -- Verify tenant access
  v_accessible := get_accessible_cooperative_ids();
  IF NOT (p_cooperative_id = ANY(v_accessible)) THEN
    RAISE EXCEPTION 'Accès refusé : coopérative non accessible';
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'processing', COUNT(*) FILTER (WHERE status = 'processing'),
    'matched', COUNT(*) FILTER (WHERE status = 'matched'),
    'unmatched', COUNT(*) FILTER (WHERE status = 'unmatched'),
    'errors', COUNT(*) FILTER (WHERE status = 'error'),
    'duplicates', COUNT(*) FILTER (WHERE status = 'duplicate'),
    'last_sync', MAX(created_at)
  ) INTO v_result
  FROM kobo_submissions
  WHERE cooperative_id = p_cooperative_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION get_kobo_stats IS
  'Returns submission statistics for a cooperative. Enforces tenant access via get_accessible_cooperative_ids().';

REVOKE ALL ON FUNCTION get_kobo_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_kobo_stats(uuid) TO authenticated;

-- =========================================================
-- pg_cron: Purge old kobo_submissions (errors > 90 days)
-- =========================================================
-- NOTE: pg_cron must be enabled in Supabase Dashboard → Database → Extensions
-- These will fail silently if pg_cron is not yet enabled.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Purge error submissions older than 90 days (weekly, Sunday 3am)
    PERFORM cron.schedule(
      'purge-kobo-submissions-errors',
      '0 3 * * 0',
      $$DELETE FROM kobo_submissions WHERE status = 'error' AND created_at < now() - interval '90 days';$$
    );

    -- Purge sync logs older than 180 days (monthly, 1st at 4am)
    PERFORM cron.schedule(
      'purge-kobo-sync-logs',
      '0 4 1 * *',
      $$DELETE FROM kobo_sync_logs WHERE started_at < now() - interval '180 days';$$
    );

    -- Purge completed kobo_sync_queue entries older than 30 days (weekly)
    PERFORM cron.schedule(
      'purge-kobo-sync-queue-completed',
      '0 3 * * 0',
      $$DELETE FROM kobo_sync_queue WHERE status = 'completed' AND processed_at < now() - interval '30 days';$$
    );

    -- Purge failed kobo_sync_queue entries older than 90 days (weekly)
    PERFORM cron.schedule(
      'purge-kobo-sync-queue-failed',
      '0 4 * * 0',
      $$DELETE FROM kobo_sync_queue WHERE status = 'failed' AND created_at < now() - interval '90 days';$$
    );
  END IF;
END;
$$;

-- =========================================================
-- Grant service_role bypass for webhook inserts
-- (service_role bypasses RLS by default in Supabase)
-- =========================================================
-- No explicit grant needed — service_role has full access.
-- The webhook handler uses service_role to insert submissions.

-- =========================================================
-- Done
-- =========================================================
