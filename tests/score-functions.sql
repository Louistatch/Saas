CREATE OR REPLACE FUNCTION public.calculate_member_ats(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member RECORD;
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

  -- 5. PARCELLE (0-100) — utilise COALESCE(superficie_ha, surface_ha, 0)
  -- pour compatibilité avec les deux noms de colonnes (migration en cours)
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
$function$
;
CREATE OR REPLACE FUNCTION public.get_member_score(target_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ats       jsonb;
  v_level_raw text;
  v_level_fr  text;
  v_paid_12m  integer;
  v_parcelles integer;
  v_prods     integer;
  v_campaigns integer;
BEGIN
  -- Appel de la fonction de calcul existante
  v_ats := calculate_member_ats(target_member_id);
  IF v_ats IS NULL THEN RETURN NULL; END IF;

  v_level_raw := v_ats->>'level';

  -- Mapping niveau EN → FR (Bronze/Argent/Or)
  v_level_fr := CASE v_level_raw
    WHEN 'bronze'   THEN 'Bronze'
    WHEN 'silver'   THEN 'Argent'
    WHEN 'gold'     THEN 'Or'
    WHEN 'platinum' THEN 'Or'
    ELSE NULL
  END;

  -- Détails pour score_details
  SELECT COUNT(*) INTO v_paid_12m
  FROM cotisations
  WHERE member_id = target_member_id
    AND status = 'paid'
    AND created_at > now() - INTERVAL '12 months';

  SELECT COUNT(*) INTO v_parcelles
  FROM parcelles WHERE member_id = target_member_id;

  SELECT COUNT(*) INTO v_prods
  FROM productions WHERE member_id = target_member_id;

  -- Campagnes consécutives : nombre de campagnes distinctes avec au moins 1 production
  SELECT COUNT(DISTINCT campaign_year) INTO v_campaigns
  FROM productions WHERE member_id = target_member_id;

  RETURN jsonb_build_object(
    'level', v_level_fr,
    'score_details', jsonb_build_object(
      'paid_cotisations_12m',  v_paid_12m,
      'parcelle_count',        v_parcelles,
      'production_count',      v_prods,
      'consecutive_campaigns', v_campaigns,
      'criteria', jsonb_build_object(
        'bronze', v_level_raw IN ('bronze','silver','gold','platinum'),
        'argent', v_level_raw IN ('silver','gold','platinum'),
        'or',     v_level_raw IN ('gold','platinum')
      )
    )
  );
END;
$function$
;
