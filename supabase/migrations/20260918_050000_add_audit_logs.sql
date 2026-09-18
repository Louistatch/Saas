CREATE TABLE IF NOT EXISTS audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cooperative_id uuid REFERENCES cooperatives(id) ON DELETE SET NULL,
  action         text NOT NULL,
  resource       text,
  resource_id    text,
  details        jsonb,
  ip_address     text,
  user_agent     text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_cooperative_id_idx ON audit_logs(cooperative_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx       ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx    ON audit_logs(created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_admin_read" ON audit_logs FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('super_admin','admin','cooperative_admin'));
CREATE POLICY "audit_logs_service_insert" ON audit_logs FOR INSERT WITH CHECK (true);
GRANT SELECT ON audit_logs TO authenticated;
GRANT INSERT ON audit_logs TO authenticated, service_role;
