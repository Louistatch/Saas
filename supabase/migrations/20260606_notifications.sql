-- Notification templates (key-value store for message templates)
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email', 'in_app')),
  subject TEXT, -- for email
  body_fr TEXT NOT NULL, -- French template with {variable} placeholders
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notification queue (processed by cron)
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  cooperative_id UUID REFERENCES cooperatives(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email', 'in_app')),
  template_key TEXT REFERENCES notification_templates(key),
  recipient_phone TEXT,
  recipient_email TEXT,
  variables JSONB DEFAULT '{}',
  body_rendered TEXT, -- final message after variable substitution
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_queue_status ON notification_queue(status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_queue_member ON notification_queue(member_id);
CREATE INDEX IF NOT EXISTS idx_notif_queue_coop ON notification_queue(cooperative_id);

-- In-app notifications (visible in dashboard bell icon)
CREATE TABLE IF NOT EXISTS notifications_inapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','alert')),
  icon TEXT, -- lucide icon name
  link TEXT, -- optional dashboard link
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inapp_coop ON notifications_inapp(cooperative_id, created_at DESC);

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_inapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Templates are read-only for all authenticated users
CREATE POLICY "templates readable by all auth" ON notification_templates
  FOR SELECT TO authenticated USING (true);

-- Queue: service role only
CREATE POLICY "queue service role only" ON notification_queue
  FOR ALL USING (auth.role() = 'service_role');

-- In-app: cooperative admins see their own
CREATE POLICY "inapp own cooperative" ON notifications_inapp
  FOR SELECT USING (
    cooperative_id IN (
      SELECT id FROM cooperatives WHERE id = cooperative_id
    )
  );

-- Seed default templates
INSERT INTO notification_templates (key, channel, subject, body_fr) VALUES
  ('cotisation_reminder_7d', 'sms', null, 'FaîtiereHub: Bonjour {first_name}, votre cotisation de {amount} FCFA est due dans 7 jours. Coopérative: {coop_name}.'),
  ('cotisation_reminder_due', 'sms', null, 'FaîtiereHub: Bonjour {first_name}, votre cotisation de {amount} FCFA est due aujourd''hui. Payez avant le {due_date}. Coopérative: {coop_name}.'),
  ('card_expiry_30d', 'sms', null, 'FaîtiereHub: Bonjour {first_name}, votre carte membre {card_number} expire le {expiry_date}. Contactez votre coopérative pour le renouvellement.'),
  ('card_scan_alert', 'in_app', null, 'Carte {card_number} scannée à {time}. Membre: {member_name}.'),
  ('welcome_member', 'sms', null, 'Bienvenue dans {coop_name}, {first_name}! Votre carte membre est prête. FaîtiereHub - Plateforme Agricole.'),
  ('ats_level_up', 'sms', null, 'Félicitations {first_name}! Votre score AgriTrust est maintenant {level} ({score}/1000). Continuez ainsi! FaîtiereHub.'),
  ('harvest_price_alert', 'in_app', null, 'Prix {culture}: {price} FCFA/kg ({delta} cette semaine). Consultez le marché.'),
  ('new_member_joined', 'in_app', null, 'Nouveau membre: {member_name} vient de rejoindre {coop_name}.')
ON CONFLICT (key) DO NOTHING;
