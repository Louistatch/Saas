-- Corrective migration — Kobo agronomic data was never ingested at all.
--
-- Measured on production before this ran: `parcelles` and `productions` both
-- held ZERO rows platform-wide, for 16 members and 6 Kobo submissions that each
-- carry one parcelle and one production. No member could therefore ever pass
-- Bronze, since get_member_score() requires >=1 parcelle and >=1 production for
-- Silver.
--
-- Three independent causes, all silent:
--
-- 1. The deployed process_kobo_submission() was a STUB. It marked the
--    submission `matched` and returned success without reading any repeat group.
--    `supabase/migrations/20260607_140000_fix_kobo_parcelles_schema.sql` (which
--    implements the real body) was never applied — no matching version exists in
--    supabase_migrations.schema_migrations; ad-hoc migrations added the columns
--    under different names instead. That file's version of the body ALSO had the
--    groups wrong (S4 for parcelles, S5 for productions, with field names
--    `culture_nom`/`superficie_culture` that exist nowhere in the XLSForm), so it
--    is deliberately not revived here.
--
--    The XLSForm (docs/kobo/README.md:34-43) defines:
--      S4 = Cotisations, S5 = Parcelles (repeat), S6 = Productions (repeat)
--
-- 2. `productions.parcelle_id` is still NOT NULL, so every insert the app
--    attempts fails with 23502 — Kobo harvest rows are not tied to one parcelle.
--    The 20260607 file meant to drop it; it never ran. Dropped below.
--
-- 3. On the TS side, `supabase.insert()` RESOLVES with an error object rather
--    than throwing, so the try/catch in lib/kobo/enrollment.ts caught nothing
--    and the failures were discarded without even a warning. Fixed in that file
--    alongside this migration.
--
-- The body below mirrors lib/kobo/enrollment.ts:377-430 field for field, so the
-- two ingestion paths can no longer drift apart silently.

-- Cause 2. productions is empty, so this rewrites no data.
ALTER TABLE productions ALTER COLUMN parcelle_id DROP NOT NULL;

-- A bare `(text)::numeric` raises on any non-numeric value, and the exception
-- aborts the WHOLE function — one field agent typing "2,5" with a comma, or
-- "3 ha", discards every other parcelle in the same submission. Returns NULL
-- instead, so the row is skipped and counted while the rest is ingested.
-- Comma decimals are accepted and normalised: they are the norm in Togo.
CREATE OR REPLACE FUNCTION safe_numeric(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_clean text;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;
  v_clean := replace(btrim(p_value), ',', '.');
  IF v_clean !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RETURN NULL;
  END IF;
  RETURN v_clean::numeric;
END;
$$;

CREATE OR REPLACE FUNCTION process_kobo_submission(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submission kobo_submissions%ROWTYPE;
  v_item RECORD;
  v_payload jsonb;
  v_inserted_parcelles integer := 0;
  v_inserted_productions integer := 0;
  v_skipped integer := 0;
  v_rows integer;
  v_culture text;
  v_superficie numeric;
  v_type_sol text;
  v_irrigation text;
  v_culture_produite text;
  v_rendement numeric;
  v_campagne text;
BEGIN
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

  -- ── Parcelles — S5 repeat group ─────────────────────────────────────────
  -- KoboToolbox qualifies repeat-child keys with the group path
  -- (`S5/culture_principale`), but older exports and manual re-imports carry
  -- the bare name. Accept both, exactly like the TS path does.
  IF v_payload ? 'S5' AND jsonb_typeof(v_payload->'S5') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_payload->'S5')
    LOOP
      v_culture := NULLIF(
        COALESCE(v_item.value->>'S5/culture_principale', v_item.value->>'culture_principale', ''),
        ''
      );
      v_superficie := safe_numeric(
        COALESCE(v_item.value->>'S5/superficie_ha', v_item.value->>'superficie_ha')
      );
      v_type_sol := NULLIF(
        COALESCE(v_item.value->>'S5/type_sol', v_item.value->>'type_sol', ''), ''
      );
      v_irrigation := NULLIF(
        COALESCE(v_item.value->>'S5/irrigation', v_item.value->>'irrigation', ''), ''
      );

      IF v_culture IS NOT NULL AND v_superficie IS NOT NULL AND v_superficie > 0 THEN
        INSERT INTO parcelles (
          member_id, cooperative_id, name, culture_principale,
          superficie_ha, soil_type, irrigation_type, source
        )
        VALUES (
          v_submission.member_id, v_submission.cooperative_id,
          'Parcelle ' || v_culture, v_culture,
          v_superficie, v_type_sol, v_irrigation, 'kobo'
        )
        ON CONFLICT DO NOTHING;
        -- Count what was actually written, not what was attempted: the previous
        -- version incremented past ON CONFLICT DO NOTHING and over-reported.
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted_parcelles := v_inserted_parcelles + v_rows;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── Productions — S6 repeat group ───────────────────────────────────────
  IF v_payload ? 'S6' AND jsonb_typeof(v_payload->'S6') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_payload->'S6')
    LOOP
      v_culture_produite := NULLIF(
        COALESCE(v_item.value->>'S6/culture_produite', v_item.value->>'culture_produite', ''),
        ''
      );
      v_rendement := safe_numeric(
        COALESCE(v_item.value->>'S6/rendement_kg', v_item.value->>'rendement_kg')
      );
      v_campagne := COALESCE(
        NULLIF(COALESCE(v_item.value->>'S6/campagne_annee', v_item.value->>'campagne_annee', ''), ''),
        EXTRACT(YEAR FROM now())::text
      );

      IF v_culture_produite IS NOT NULL AND v_rendement IS NOT NULL AND v_rendement > 0 THEN
        INSERT INTO productions (
          member_id, cooperative_id, culture_name,
          quantity_kg, campaign_year, source
        )
        VALUES (
          v_submission.member_id, v_submission.cooperative_id,
          v_culture_produite, v_rendement, v_campagne, 'kobo'
        )
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted_productions := v_inserted_productions + v_rows;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE kobo_submissions
  SET status = 'matched',
      -- Merge, never replace: enrollment provenance (mode, card_number,
      -- cooperative_name) already lives here and must survive a reprocess.
      processed_payload = COALESCE(processed_payload, '{}'::jsonb) || jsonb_build_object(
        'parcelles_inserted', v_inserted_parcelles,
        'productions_inserted', v_inserted_productions,
        'rows_skipped', v_skipped
      ),
      processed_at = now(),
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'matched', true,
    'inserted_parcelles', v_inserted_parcelles,
    'inserted_productions', v_inserted_productions,
    'rows_skipped', v_skipped
  );
END;
$$;

COMMENT ON FUNCTION process_kobo_submission(uuid) IS
  'Ingests S5 (parcelles) and S6 (productions) repeat groups for a submission '
  'already matched to an existing member. Field names mirror '
  'lib/kobo/enrollment.ts — change both together or the two ingestion paths '
  'drift apart silently.';
