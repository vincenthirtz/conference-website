-- Migration: Create blizzard_news table
-- Description: Store general Overwatch news from Blizzard (not patch notes)

CREATE TABLE IF NOT EXISTS blizzard_news (
  id TEXT PRIMARY KEY,                          -- Slug/ID from URL (ex: "24252008")
  title TEXT NOT NULL,
  date TEXT NOT NULL,                           -- Date as displayed (ex: "5 décembre 2025")
  date_parsed DATE,                             -- ISO date for sorting
  link TEXT NOT NULL,
  image_url TEXT,                               -- Thumbnail image
  category TEXT,                                -- Category tag (ex: "Événement", "Mise à jour")
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for sorting by date
CREATE INDEX IF NOT EXISTS idx_blizzard_news_date ON blizzard_news(date_parsed DESC NULLS LAST);

-- RLS policies
ALTER TABLE blizzard_news ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth needed)
CREATE POLICY "Public can read blizzard news"
  ON blizzard_news
  FOR SELECT
  TO public
  USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access to blizzard news"
  ON blizzard_news
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_blizzard_news_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_blizzard_news_updated_at ON blizzard_news;
CREATE TRIGGER trigger_blizzard_news_updated_at
  BEFORE UPDATE ON blizzard_news
  FOR EACH ROW
  EXECUTE FUNCTION update_blizzard_news_updated_at();
