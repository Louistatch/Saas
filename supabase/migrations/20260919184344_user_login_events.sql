-- Suivi des connexions (§ demande admin : « qui s'est connecté, combien »).
-- auth.audit_log_entries est vide sur ce projet (non peuplé par cette
-- instance GoTrue) — on ne peut pas s'y fier. Table applicative dédiée,
-- écrite uniquement côté serveur après vérification de la session
-- (jamais de user_id fourni par le client) — cf. app/api/auth/log-login.

CREATE TABLE user_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_login_events_user ON user_login_events(user_id, created_at DESC);
CREATE INDEX idx_user_login_events_created ON user_login_events(created_at DESC);

ALTER TABLE user_login_events ENABLE ROW LEVEL SECURITY;

-- Lecture : super_admin uniquement (c'est un journal d'accès, pas une donnée
-- que l'utilisateur consulte sur lui-même). Écriture : service_role
-- uniquement, aucune policy INSERT côté client.
CREATE POLICY "login events super_admin read" ON user_login_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
