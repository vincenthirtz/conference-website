-- Migration: Create partners and partnership_requests tables
-- Description: Partners management and partnership request form submissions

-- =============================================================================
-- PARTNERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('super', 'major', 'cultural')),
  logo_url TEXT,
  website_url TEXT,
  note TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for listing by category and order
CREATE INDEX IF NOT EXISTS idx_partners_category_order
ON partners (category, display_order, created_at DESC);

-- Index for active partners
CREATE INDEX IF NOT EXISTS idx_partners_active
ON partners (is_active, category);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_partners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS partners_updated_at ON partners;
CREATE TRIGGER partners_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW
  EXECUTE FUNCTION update_partners_updated_at();

COMMENT ON TABLE partners IS 'Partners displayed on the website';
COMMENT ON COLUMN partners.name IS 'Partner name';
COMMENT ON COLUMN partners.description IS 'Partner description shown on the page';
COMMENT ON COLUMN partners.category IS 'Partner category: super, major, or cultural';
COMMENT ON COLUMN partners.logo_url IS 'URL to partner logo image';
COMMENT ON COLUMN partners.website_url IS 'Partner website URL';
COMMENT ON COLUMN partners.note IS 'Optional badge/note (e.g., "Nouveau", "2026")';
COMMENT ON COLUMN partners.display_order IS 'Order within category (lower = first)';
COMMENT ON COLUMN partners.is_active IS 'Whether partner is visible on public page';

-- =============================================================================
-- PARTNERSHIP REQUESTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS partnership_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  category TEXT NOT NULL CHECK (category IN ('super', 'major', 'cultural', 'other')),
  message TEXT NOT NULL,
  budget_range TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'contacted', 'negotiating', 'accepted', 'declined', 'archived')),
  admin_notes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  contacted_at TIMESTAMPTZ
);

-- Index for listing by status and date
CREATE INDEX IF NOT EXISTS idx_partnership_requests_status_date
ON partnership_requests (status, created_at DESC);

-- Index for email search
CREATE INDEX IF NOT EXISTS idx_partnership_requests_email
ON partnership_requests (email);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_partnership_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS partnership_requests_updated_at ON partnership_requests;
CREATE TRIGGER partnership_requests_updated_at
  BEFORE UPDATE ON partnership_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_partnership_requests_updated_at();

COMMENT ON TABLE partnership_requests IS 'Partnership request form submissions';
COMMENT ON COLUMN partnership_requests.company_name IS 'Company or organization name';
COMMENT ON COLUMN partnership_requests.contact_name IS 'Contact person name';
COMMENT ON COLUMN partnership_requests.email IS 'Contact email address';
COMMENT ON COLUMN partnership_requests.phone IS 'Optional phone number';
COMMENT ON COLUMN partnership_requests.website IS 'Company website';
COMMENT ON COLUMN partnership_requests.category IS 'Desired partnership category';
COMMENT ON COLUMN partnership_requests.message IS 'Partnership proposal message';
COMMENT ON COLUMN partnership_requests.budget_range IS 'Optional budget indication';
COMMENT ON COLUMN partnership_requests.status IS 'Processing status: new, read, contacted, negotiating, accepted, declined, archived';
COMMENT ON COLUMN partnership_requests.admin_notes IS 'Internal notes from staff';
COMMENT ON COLUMN partnership_requests.ip_address IS 'IP address for spam detection';
COMMENT ON COLUMN partnership_requests.user_agent IS 'Browser user agent for spam detection';

-- =============================================================================
-- SEED DATA: Initial partners
-- =============================================================================
INSERT INTO partners (name, description, category, logo_url, website_url, note, display_order, is_active)
VALUES
  (
    'Betty''s Bar',
    'Soutien terrain et visibilité locale pour la prochaine édition, avec relais auprès du public esport.',
    'major',
    'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0c/ab/a2/6b/betty-s-bar.jpg?w=500&h=300&s=1',
    'https://www.instagram.com/bettysbarlyon/?hl=fr',
    'Nouveau',
    0,
    true
  ),
  (
    'Librairie à soi.e',
    'Déjà à nos côtés pour la médiation, la mise en avant des joueuses et l''animation d''ateliers.',
    'cultural',
    'https://static.wixstatic.com/media/54f35a_ddaa971440884bba8f6e9b9b61ec2b0d~mv2.png/v1/crop/x_134,y_113,w_879,h_459/fill/w_250,h_130,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Librairie%20%C3%A0%20soi_e%20Lyon%20f%C3%A9iminisme.png',
    'https://www.librairieasoie.com',
    'Nouveau',
    0,
    true
  );
