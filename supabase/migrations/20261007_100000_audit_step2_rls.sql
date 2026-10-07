-- Audit — étape 2 : fonctions SECURITY DEFINER, notifications, scores,
-- stockage des photos, AgriAcademy, journal d'audit, modèles, météo.
-- Aucune donnée supprimée. Les appels service_role (webhooks, cron,
-- AgriTogo) restent autorisés partout.

-- Appel serveur (clé service_role) : contourne les contrôles applicatifs.
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$ SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role' $$;

-- Tout rôle rattaché à cette coopérative (ou à une faîtière parente), ou
-- super_admin. Pour les lectures de statistiques.
CREATE OR REPLACE FUNCTION public.can_read_coop(target_coop uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_service_role()
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
      OR target_coop = ANY (public.get_accessible_cooperative_ids())
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_coop(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_read_coop(uuid) TO authenticated, service_role;

-- ── 1. Fonctions appelables sans contrôle de l'appelant ─────────────────

-- Statistiques du tableau de bord (page /dashboard, client navigateur).
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_cooperative_id uuid)
 RETURNS TABLE(total_members bigint, active_cards bigint, total_exploitations bigint, total_parcelles bigint, scans_today bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.can_read_coop(p_cooperative_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM members       WHERE cooperative_id = p_cooperative_id)::bigint,
    (SELECT COUNT(*) FROM member_cards  WHERE cooperative_id = p_cooperative_id AND status = 'active')::bigint,
    (SELECT COUNT(*) FROM fiches_techniques WHERE cooperative_id = p_cooperative_id AND status = 'published')::bigint,
    (SELECT COUNT(*) FROM parcelles     WHERE cooperative_id = p_cooperative_id)::bigint,
    (SELECT COUNT(*) FROM member_access_logs
       WHERE cooperative_id = p_cooperative_id
         AND action = 'scan'
         AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC'))::bigint;
END;
$function$;

-- Statistiques Kobo (route /api/integrations/kobo, admin + tenant).
CREATE OR REPLACE FUNCTION public.get_kobo_stats(p_cooperative_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_result jsonb; BEGIN
  IF NOT public.can_read_coop(p_cooperative_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('total', COUNT(*), 'pending', COUNT(*) FILTER (WHERE status = 'pending'), 'processing', COUNT(*) FILTER (WHERE status = 'processing'), 'matched', COUNT(*) FILTER (WHERE status = 'matched'), 'unmatched', COUNT(*) FILTER (WHERE status = 'unmatched'), 'errors', COUNT(*) FILTER (WHERE status = 'error'), 'duplicates', COUNT(*) FILTER (WHERE status = 'duplicate'), 'last_sync', MAX(created_at)) INTO v_result FROM kobo_submissions WHERE cooperative_id = p_cooperative_id;
  RETURN COALESCE(v_result, '{}'::jsonb);
END; $function$;

-- Totaux de la plateforme : page /admin (super_admin) uniquement.
CREATE OR REPLACE FUNCTION public.get_platform_totals()
 RETURNS TABLE(total_cooperatives bigint, total_members bigint, total_exploitations bigint, total_active_cards bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (public.is_service_role()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM cooperatives),
    (SELECT COUNT(*) FROM members),
    (SELECT COUNT(*) FROM parcelles),
    (SELECT COUNT(*) FROM member_cards WHERE status = 'active');
END;
$function$;

-- Écritures Kobo : appelées par le webhook (service_role) et par la
-- synchronisation lancée par un admin (session utilisateur). Contrôle
-- ajouté en tête ; le corps est inchangé.
CREATE OR REPLACE FUNCTION public.match_kobo_submission_to_member(p_submission_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_card_number text; v_cooperative_id uuid; v_member_id uuid; BEGIN
  SELECT member_card_number, cooperative_id INTO v_card_number, v_cooperative_id FROM kobo_submissions WHERE id = p_submission_id;
  IF NOT (public.is_service_role() OR public.is_coop_admin_or_super(v_cooperative_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_card_number IS NULL OR v_card_number = '' THEN UPDATE kobo_submissions SET status = 'unmatched', updated_at = now() WHERE id = p_submission_id; RETURN; END IF;
  SELECT m.id INTO v_member_id FROM member_cards mc JOIN members m ON m.id = mc.member_id WHERE mc.card_number = v_card_number AND mc.cooperative_id = v_cooperative_id AND mc.status = 'active' LIMIT 1;
  IF v_member_id IS NOT NULL THEN UPDATE kobo_submissions SET member_id = v_member_id, status = 'matched', matched_at = now(), updated_at = now() WHERE id = p_submission_id;
  ELSE UPDATE kobo_submissions SET status = 'unmatched', updated_at = now() WHERE id = p_submission_id; END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.process_kobo_submission(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  SELECT * INTO v_submission FROM kobo_submissions WHERE id = p_submission_id;

  IF v_submission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  -- Contrôle de l'appelant (ajouté par l'audit) : écriture dans les
  -- parcelles/productions de la coopérative de la soumission.
  IF NOT (public.is_service_role() OR public.is_coop_admin_or_super(v_submission.cooperative_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_submission.member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matched member');
  END IF;

  v_payload := v_submission.raw_payload;

  IF v_payload ? 'S5' AND jsonb_typeof(v_payload->'S5') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_payload->'S5')
    LOOP
      v_culture := NULLIF(COALESCE(v_item.value->>'S5/culture_principale', v_item.value->>'culture_principale', ''), '');
      v_superficie := safe_numeric(COALESCE(v_item.value->>'S5/superficie_ha', v_item.value->>'superficie_ha'));
      v_type_sol := NULLIF(COALESCE(v_item.value->>'S5/type_sol', v_item.value->>'type_sol', ''), '');
      v_irrigation := NULLIF(COALESCE(v_item.value->>'S5/irrigation', v_item.value->>'irrigation', ''), '');

      IF v_culture IS NOT NULL AND v_superficie IS NOT NULL AND v_superficie > 0 THEN
        INSERT INTO parcelles (member_id, cooperative_id, name, culture_principale,
                               superficie_ha, soil_type, irrigation_type, source)
        VALUES (v_submission.member_id, v_submission.cooperative_id,
                'Parcelle ' || v_culture, v_culture,
                v_superficie, v_type_sol, v_irrigation, 'kobo')
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted_parcelles := v_inserted_parcelles + v_rows;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_payload ? 'S6' AND jsonb_typeof(v_payload->'S6') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_payload->'S6')
    LOOP
      v_culture_produite := NULLIF(COALESCE(v_item.value->>'S6/culture_produite', v_item.value->>'culture_produite', ''), '');
      v_rendement := safe_numeric(COALESCE(v_item.value->>'S6/rendement_kg', v_item.value->>'rendement_kg'));
      v_campagne := COALESCE(
        NULLIF(COALESCE(v_item.value->>'S6/campagne_annee', v_item.value->>'campagne_annee', ''), ''),
        EXTRACT(YEAR FROM now())::text
      );

      IF v_culture_produite IS NOT NULL AND v_rendement IS NOT NULL AND v_rendement > 0 THEN
        INSERT INTO productions (member_id, cooperative_id, culture_name,
                                 quantity_kg, campaign_year, source)
        VALUES (v_submission.member_id, v_submission.cooperative_id,
                v_culture_produite, v_rendement, v_campagne, 'kobo')
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
$function$;

-- Recalcul du score ATS (route /api/members/[id]/ats, session utilisateur).
CREATE OR REPLACE FUNCTION public.upsert_member_ats(p_member_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
  v_coop_id UUID;
BEGIN
  SELECT cooperative_id INTO v_coop_id FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT public.can_read_coop(v_coop_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
$function$;

-- Fonctions de déclencheur : jamais appelables directement.
REVOKE EXECUTE ON FUNCTION public.protect_haroo_privileges() FROM anon, authenticated, public;

-- ── 2. Notifications internes : la règle ne filtrait rien ───────────────
DROP POLICY IF EXISTS "inapp own cooperative" ON public.notifications_inapp;
CREATE POLICY "inapp own cooperative" ON public.notifications_inapp
  FOR SELECT TO authenticated
  USING (cooperative_id = ANY (public.get_accessible_cooperative_ids()));

-- ── 3. Scores ATS : un visiteur sans compte récupérait tous les scores ──
-- Aucune page ni route ne lit cette table en anonyme.
DROP POLICY IF EXISTS ats_scores_anon_card_verify ON public.member_ats_scores;

-- ── 4. Stockage member-photos : tout compte modifiait toutes les photos ─
-- Les photos sont rangées sous <cooperative_id>/… (components/shared/
-- photo-upload.tsx). La lecture publique (cartes, QR) est conservée.
DROP POLICY IF EXISTS "Auth update member photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload member photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete member photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update member photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload member photos" ON storage.objects;
CREATE POLICY "member photos writable by own org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-photos'
    AND ((storage.foldername(name))[1] IN (SELECT c::text FROM unnest(public.get_accessible_cooperative_ids()) c)
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin')));
CREATE POLICY "member photos updatable by own org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'member-photos'
    AND ((storage.foldername(name))[1] IN (SELECT c::text FROM unnest(public.get_accessible_cooperative_ids()) c)
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin')));
CREATE POLICY "member photos deletable by own org" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'member-photos'
    AND ((storage.foldername(name))[1] IN (SELECT c::text FROM unnest(public.get_accessible_cooperative_ids()) c)
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin')));

-- ── 5. AgriAcademy : tout membre pouvait publier et noter ───────────────
DROP POLICY IF EXISTS "modules admin write" ON public.academy_modules;
CREATE POLICY "modules admin write" ON public.academy_modules
  FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id))
  WITH CHECK (public.is_coop_admin_or_super(cooperative_id));

DROP POLICY IF EXISTS "progress own" ON public.academy_progress;
CREATE POLICY "progress coop read" ON public.academy_progress
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT m.id FROM public.members m
                       WHERE m.cooperative_id = ANY (public.get_accessible_cooperative_ids())));
CREATE POLICY "progress admin write" ON public.academy_progress
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.members m
                 WHERE m.id = academy_progress.member_id
                   AND public.is_coop_admin_or_super(m.cooperative_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.members m
                      WHERE m.id = academy_progress.member_id
                        AND public.is_coop_admin_or_super(m.cooperative_id)));

-- ── 6. Journal d'audit : écriture ouverte, lecture inter-coopératives ───
-- Toutes les écritures passent par le client service_role.
DROP POLICY IF EXISTS audit_logs_service_insert ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_admin_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin')
         OR (cooperative_id IS NOT NULL AND public.is_coop_admin_or_super(cooperative_id)));

-- ── 7. Modèles et météo ─────────────────────────────────────────────────
DROP POLICY IF EXISTS templates_admin_all ON public.templates;
CREATE POLICY templates_coop_read ON public.templates
  FOR SELECT TO authenticated
  USING (cooperative_id = ANY (public.get_accessible_cooperative_ids()));
CREATE POLICY templates_admin_write ON public.templates
  FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id))
  WITH CHECK (public.is_coop_admin_or_super(cooperative_id));

-- La météo est écrite par le cron et la route météo (service_role).
DROP POLICY IF EXISTS weather_insert_service ON public.weather_data;
