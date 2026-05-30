-- Migration: Add cooperative_settings table for card templates and settings
-- This table stores customizable settings for each cooperative including card templates and card generation settings

-- Create cooperative_settings table
CREATE TABLE IF NOT EXISTS cooperative_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  card_template JSONB DEFAULT '{"title": "Member Card", "subtitle": "Digital Access Pass", "bgColor": "#16a34a", "textColor": "#ffffff"}',
  card_settings JSONB DEFAULT '{"defaultValidityDays": 365, "qrCodeIncludes": {"cardNumber": true, "memberId": true, "cooperativeId": true}}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(cooperative_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cooperative_settings_cooperative_id ON cooperative_settings(cooperative_id);

-- Add RLS policies
ALTER TABLE cooperative_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins can view all settings
CREATE POLICY "Super admins can view all cooperative settings"
  ON cooperative_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Policy: Cooperative admins can view their own cooperative settings
CREATE POLICY "Cooperative admins can view their cooperative settings"
  ON cooperative_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.cooperative_id = cooperative_settings.cooperative_id
      AND profiles.role IN ('cooperative_admin', 'member')
    )
  );

-- Policy: Super admins can insert/update all settings
CREATE POLICY "Super admins can manage all cooperative settings"
  ON cooperative_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Policy: Cooperative admins can manage their own cooperative settings
CREATE POLICY "Cooperative admins can manage their cooperative settings"
  ON cooperative_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.cooperative_id = cooperative_settings.cooperative_id
      AND profiles.role = 'cooperative_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.cooperative_id = cooperative_settings.cooperative_id
      AND profiles.role = 'cooperative_admin'
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cooperative_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cooperative_settings_updated_at
  BEFORE UPDATE ON cooperative_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_cooperative_settings_updated_at();

-- Insert default settings for existing cooperatives
INSERT INTO cooperative_settings (cooperative_id)
SELECT id FROM cooperatives
ON CONFLICT (cooperative_id) DO NOTHING;

COMMENT ON TABLE cooperative_settings IS 'Stores customizable settings for each cooperative including card templates and card generation settings';
COMMENT ON COLUMN cooperative_settings.card_template IS 'JSON object containing card design template (title, subtitle, bgColor, textColor)';
COMMENT ON COLUMN cooperative_settings.card_settings IS 'JSON object containing card generation settings (defaultValidityDays, qrCodeIncludes)';
