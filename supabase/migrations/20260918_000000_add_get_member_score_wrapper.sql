-- Crée la fonction get_member_score() appelée par lib/members/score.ts.
-- Wrapper autour de calculate_member_ats() qui traduit le format et les niveaux EN→FR.
CREATE OR REPLACE FUNCTION get_member_score(target_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_ats       jsonb;
  v_level_raw text;
  v_level_fr  text;
  v_paid_12m  integer;
  v_parcelles integer;
  v_prods     integer;
  v_campaigns integer;
BEGIN
  v_ats := calculate_member_ats(target_member_id);
  IF v_ats IS NULL THEN RETURN NULL; END IF;

  v_level_raw := v_ats->>'level';

  v_level_fr := CASE v_level_raw
    WHEN 'bronze'   THEN 'Bronze'
    WHEN 'silver'   THEN 'Argent'
    WHEN 'gold'     THEN 'Or'
    WHEN 'platinum' THEN 'Or'
    ELSE NULL
  END;

  SELECT COUNT(*) INTO v_paid_12m
  FROM cotisations
  WHERE member_id = target_member_id
    AND status = 'paid'
    AND created_at > now() - INTERVAL '12 months';

  SELECT COUNT(*) INTO v_parcelles
  FROM parcelles WHERE member_id = target_member_id;

  SELECT COUNT(*) INTO v_prods
  FROM productions WHERE member_id = target_member_id;

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
$$;

GRANT EXECUTE ON FUNCTION get_member_score(uuid) TO anon, authenticated;
