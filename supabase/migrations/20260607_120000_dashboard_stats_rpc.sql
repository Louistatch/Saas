-- =========================================================
-- get_dashboard_stats(p_cooperative_id uuid) RPC
--
-- Regroups the 5 simple count queries previously issued in parallel
-- by /dashboard (members, active cards, published fiches techniques,
-- parcelles, scans today) into a single round-trip.
--
-- Security: caller must belong to the requested cooperative
-- (checked against profiles.cooperative_id), otherwise zeros are returned.
-- Safe to re-run.
-- =========================================================

DROP FUNCTION IF EXISTS get_dashboard_stats(uuid);

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_cooperative_id uuid)
RETURNS TABLE (
  total_members        bigint,
  active_cards         bigint,
  total_exploitations  bigint,
  total_parcelles      bigint,
  scans_today          bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allow AS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND cooperative_id = p_cooperative_id
  )
  SELECT
    (SELECT COUNT(*) FROM members
       WHERE cooperative_id = p_cooperative_id AND EXISTS (SELECT 1 FROM allow)),
    (SELECT COUNT(*) FROM member_cards
       WHERE cooperative_id = p_cooperative_id AND status = 'active'
         AND EXISTS (SELECT 1 FROM allow)),
    (SELECT COUNT(*) FROM fiches_techniques
       WHERE cooperative_id = p_cooperative_id AND status = 'published'
         AND EXISTS (SELECT 1 FROM allow)),
    (SELECT COUNT(*) FROM parcelles
       WHERE cooperative_id = p_cooperative_id AND EXISTS (SELECT 1 FROM allow)),
    (SELECT COUNT(*) FROM member_access_logs
       WHERE cooperative_id = p_cooperative_id AND action = 'scan'
         AND created_at >= date_trunc('day', now())
         AND EXISTS (SELECT 1 FROM allow));
$$;
