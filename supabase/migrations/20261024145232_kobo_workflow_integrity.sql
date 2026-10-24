-- Kobo: the faîtière receives a submission, but its member/card belongs to a child coop.
-- Keep the submission access scope; write agriculture under the member's own coop.
-- Row lock + processed_at make replay atomic. No historical record is re-imported.
-- Apply before deploying the accompanying JS change; no payments or credits are touched.
CREATE OR REPLACE FUNCTION public.match_kobo_submission_to_member(p_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.kobo_submissions%ROWTYPE; member uuid;
BEGIN
  SELECT * INTO s FROM public.kobo_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING ERRCODE = '22023'; END IF;
  IF NOT (coalesce(public.is_service_role(), false)
    OR coalesce(public.is_coop_admin_or_super(s.cooperative_id), false)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  WITH RECURSIVE scope AS (
    SELECT id FROM public.cooperatives WHERE id = s.cooperative_id AND deleted_at IS NULL
    UNION
    SELECT c.id FROM public.cooperatives c JOIN scope r ON c.parent_id = r.id WHERE c.deleted_at IS NULL
  )
  SELECT m.id INTO member FROM public.member_cards c JOIN public.members m ON m.id = c.member_id
    WHERE c.card_number = s.member_card_number AND c.cooperative_id IN (SELECT id FROM scope)
      AND m.cooperative_id = c.cooperative_id AND m.deleted_at IS NULL AND c.status = 'active'
    LIMIT 1;
  UPDATE public.kobo_submissions SET member_id = member,
    status = CASE WHEN member IS NULL THEN 'unmatched' ELSE 'matched' END,
    matched_at = CASE WHEN member IS NOT NULL THEN now() END, updated_at = now()
    WHERE id = p_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_kobo_submission(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission public.kobo_submissions%ROWTYPE;
  v_target_cooperative uuid;
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
  FROM public.kobo_submissions
  WHERE id = p_submission_id FOR UPDATE;

  IF v_submission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  IF NOT (coalesce(public.is_service_role(), false)
    OR coalesce(public.is_coop_admin_or_super(v_submission.cooperative_id), false)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT m.cooperative_id INTO v_target_cooperative FROM public.members m
  WHERE m.id = v_submission.member_id AND m.deleted_at IS NULL
    AND m.cooperative_id IN (
      WITH RECURSIVE scope AS (
        SELECT id FROM public.cooperatives WHERE id = v_submission.cooperative_id AND deleted_at IS NULL
        UNION
        SELECT c.id FROM public.cooperatives c JOIN scope s ON c.parent_id = s.id
          WHERE c.deleted_at IS NULL
      ) SELECT id FROM scope
    );
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matched member in this organization');
  END IF;
  IF v_submission.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  v_payload := coalesce(v_submission.processed_payload->'normalized_payload', v_submission.raw_payload);
  IF (v_payload ? 'S5' AND jsonb_typeof(v_payload->'S5') IS DISTINCT FROM 'array')
    OR (v_payload ? 'S6' AND jsonb_typeof(v_payload->'S6') IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'S5 and S6 must be repeat arrays' USING ERRCODE = '22023';
  END IF;

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
      v_superficie := public.safe_numeric(
        COALESCE(v_item.value->>'S5/superficie_ha', v_item.value->>'superficie_ha')
      );
      v_type_sol := NULLIF(
        COALESCE(v_item.value->>'S5/type_sol', v_item.value->>'type_sol', ''), ''
      );
      v_irrigation := NULLIF(
        COALESCE(v_item.value->>'S5/irrigation', v_item.value->>'irrigation', ''), ''
      );

      IF v_culture IS NOT NULL AND v_superficie IS NOT NULL AND v_superficie > 0 THEN
        INSERT INTO public.parcelles (
          member_id, cooperative_id, name, culture_principale,
          superficie_ha, soil_type, irrigation_type, source
        )
        VALUES (
          v_submission.member_id, v_target_cooperative,
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
      v_rendement := public.safe_numeric(
        COALESCE(v_item.value->>'S6/rendement_kg', v_item.value->>'rendement_kg')
      );
      v_campagne := COALESCE(
        NULLIF(COALESCE(v_item.value->>'S6/campagne_annee', v_item.value->>'campagne_annee', ''), ''),
        EXTRACT(YEAR FROM now())::text
      );

      IF v_culture_produite IS NOT NULL AND v_rendement IS NOT NULL AND v_rendement > 0 THEN
        INSERT INTO public.productions (
          member_id, cooperative_id, culture_name,
          quantity_kg, campaign_year, source
        )
        VALUES (
          v_submission.member_id, v_target_cooperative,
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

  UPDATE public.kobo_submissions
  SET status = 'matched', error_message = NULL,
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

REVOKE ALL ON FUNCTION public.match_kobo_submission_to_member(uuid),
  public.process_kobo_submission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_kobo_submission_to_member(uuid),
  public.process_kobo_submission(uuid) TO authenticated, service_role;
