CREATE OR REPLACE FUNCTION get_dashboard_stats(p_cooperative_id uuid)
RETURNS TABLE (
  total_members       bigint,
  active_cards        bigint,
  total_exploitations bigint,
  total_parcelles     bigint,
  scans_today         bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*) FROM members           WHERE cooperative_id = p_cooperative_id)::bigint,
    (SELECT COUNT(*) FROM member_cards      WHERE cooperative_id = p_cooperative_id AND status = 'active')::bigint,
    (SELECT COUNT(*) FROM fiches_techniques WHERE cooperative_id = p_cooperative_id AND status = 'published')::bigint,
    (SELECT COUNT(*) FROM parcelles         WHERE cooperative_id = p_cooperative_id)::bigint,
    (SELECT COUNT(*) FROM member_access_logs
       WHERE cooperative_id = p_cooperative_id AND action = 'scan'
         AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC'))::bigint;
$$;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(uuid) TO authenticated;
