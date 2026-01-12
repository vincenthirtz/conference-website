-- Migration: Create site_settings table
-- Description: Stores configurable site settings (replaces env vars for dynamic content)

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES staff(id) ON DELETE SET NULL
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_site_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS site_settings_updated_at ON site_settings;
CREATE TRIGGER site_settings_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_site_settings_updated_at();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings(key);

-- Insert default video URL
INSERT INTO site_settings (key, value, description)
VALUES (
  'about_video_url',
  'https://www.youtube.com/watch?v=3j6w7CjXne8',
  'URL de la vidéo affichée dans la section "A propos" de la page d''accueil (YouTube ou MP4)'
)
ON CONFLICT (key) DO NOTHING;

-- Insert default contact email
INSERT INTO site_settings (key, value, description)
VALUES (
  'contact_email',
  'owwomenscup@gmail.com',
  'Email de contact principal affiché sur le site'
)
ON CONFLICT (key) DO NOTHING;
