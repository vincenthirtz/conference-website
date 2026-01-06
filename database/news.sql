-- Table: public.news
-- News posts managed by admin staff only.

CREATE TABLE IF NOT EXISTS public.news (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  tag text NOT NULL DEFAULT 'general',
  excerpt text,
  content text NOT NULL,
  image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  author_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_published_at_idx
  ON public.news (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS news_status_idx
  ON public.news (status);

CREATE INDEX IF NOT EXISTS news_tag_idx
  ON public.news (tag);

-- In case the table already exists, ensure the tag column is present
ALTER TABLE IF EXISTS public.news
  ADD COLUMN IF NOT EXISTS tag text NOT NULL DEFAULT 'general';

-- Trigger to keep updated_at fresh (optional if not already present)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS news_update_updated_at ON public.news;
CREATE TRIGGER news_update_updated_at
BEFORE UPDATE ON public.news
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
