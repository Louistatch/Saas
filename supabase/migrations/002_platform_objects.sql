-- Migration: Platform-level views, RPCs, settings, and indexes
-- ----------------------------------------------------------
-- Adds:
--   * cooperative_stats view used by /admin and /admin/analytics
--   * get_platform_totals() RPC used by /admin
--   * platform_settings key/value table used by /admin/settings
--   * Useful indexes on cooperative_id-filtered tables
--
-- Safe to re-run.

-- =========================================================
-- Indexes
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_members_cooperative_id ON members(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_members_cooperative_status ON members(cooperative_id, status);
CREATE INDEX IF NOT EXISTS idx_exploitations_cooperative_id ON exploitations(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_exploitations_active ON exploitations(cooperative_id, active);
CREATE INDEX IF NOT EXISTS idx_member_cards_cooperative_id ON member_cards(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_member_cards_cooperative_status ON member_cards(cooperative_id, status);
CREATE INDEX IF NOT EXISTS idx_member_cards_member_status ON member_cards(member_id, status);
CREATE INDEX IF NOT EXISTS idx_integrations_cooperative_type
  ON integrations(cooperative_id, type);
CREATE INDEX IF NOT EXISTS idx_profiles_cooperative_id ON profiles(cooperative_id);

-- =========================================================
-- cooperative_stats view
-- =========================================================
DROP VIEW IF EXISTS cooperative_stats CASCADE;

CREATE VIEW cooperative_stats
  WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.name,
  c.description,
  c.primary_color,
  c.created_at,
  COALESCE(m.member_count, 0)            AS member_count,
  COALESCE(e.exploitation_count, 0)      AS exploitation_count,
  COALESCE(k.active_card_count, 0)       AS active_card_count
FROM cooperatives c
LEFT JOIN (
  SELECT cooperative_id, COUNT(*)::bigint AS member_count
  FROM members
  GROUP BY cooperative_id
) m ON m.cooperative_id = c.id
LEFT JOIN (
  SELECT cooperative_id, COUNT(*)::bigint AS exploitation_count
  FROM exploitations
  GROUP BY cooperative_id
) e ON e.cooperative_id = c.id
LEFT JOIN (
  SELECT cooperative_id, COUNT(*)::bigint AS active_card_count
  FROM member_cards
  WHERE status = 'active'
  GROUP BY cooperative_id
) k ON k.cooperative_id = c.id;

COMMENT ON VIEW cooperative_stats IS
  'Per-cooperative aggregate counts. Uses security_invoker so RLS on the underlying tables applies.';

GRANT SELECT ON cooperative_stats TO authenticated;

-- =========================================================
-- get_platform_totals() RPC
-- =========================================================
DROP FUNCTION IF EXISTS get_platform_totals();

CREATE OR REPLACE FUNCTION get_platform_totals()
RETURNS TABLE (
  total_cooperatives  bigint,
  total_members       bigint,
  total_exploitations bigint,
  total_active_cards  bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Only super_admin may run this. Other roles get empty rows back.
  WITH allow AS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
  SELECT
    (SELECT COUNT(*) FROM cooperatives  WHERE EXISTS (SELECT 1 FROM allow)),
    (SELECT COUNT(*) FROM members       WHERE EXISTS (SELECT 1 FROM allow)),
    (SELECT COUNT(*) FROM exploitations WHERE EXISTS (SELECT 1 FROM allow)),
    (SELECT COUNT(*) FROM member_cards
       WHERE status = 'active' AND EXISTS (SELECT 1 FROM allow));
$$;

COMMENT ON FUNCTION get_platform_totals IS
  'Platform-wide aggregate counts. Restricted to super_admin via internal check.';

REVOKE ALL ON FUNCTION get_platform_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_platform_totals() TO authenticated;

-- =========================================================
-- platform_settings key/value table
-- =========================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read platform settings" ON platform_settings;
CREATE POLICY "Super admins read platform settings"
  ON platform_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Super admins manage platform settings" ON platform_settings;
CREATE POLICY "Super admins manage platform settings"
  ON platform_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE OR REPLACE FUNCTION update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_settings_updated_at ON platform_settings;
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_settings_updated_at();

COMMENT ON TABLE platform_settings IS
  'Key/value store for platform-wide settings. Super-admin only.';
