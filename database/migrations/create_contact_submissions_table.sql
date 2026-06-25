-- Migration: Create contact_submissions table
-- Description: Stores contact form submissions (replaces Formspree)

CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived', 'spam')),
  admin_notes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ
);

-- Index for listing by status and date
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_date
ON contact_submissions (status, created_at DESC);

-- Index for email search
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email
ON contact_submissions (email);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_contact_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_submissions_updated_at ON contact_submissions;
CREATE TRIGGER contact_submissions_updated_at
  BEFORE UPDATE ON contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_submissions_updated_at();

-- RLS policies
-- ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- No public read access - only staff via service role
-- Service role bypasses RLS, so admin operations work without additional policies

COMMENT ON TABLE contact_submissions IS 'Contact form submissions from the website';
COMMENT ON COLUMN contact_submissions.name IS 'Name of the person who submitted';
COMMENT ON COLUMN contact_submissions.email IS 'Email address for reply';
COMMENT ON COLUMN contact_submissions.subject IS 'Subject/category of the message';
COMMENT ON COLUMN contact_submissions.message IS 'The actual message content';
COMMENT ON COLUMN contact_submissions.status IS 'Processing status: new, read, replied, archived, spam';
COMMENT ON COLUMN contact_submissions.admin_notes IS 'Internal notes from staff';
COMMENT ON COLUMN contact_submissions.ip_address IS 'IP address for spam detection';
COMMENT ON COLUMN contact_submissions.user_agent IS 'Browser user agent for spam detection';
