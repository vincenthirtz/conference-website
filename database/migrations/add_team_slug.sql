-- Migration: add a `slug` column to `teams`
-- Date: 2026-05-04
--
-- Adds a unique, URL-friendly identifier to every team so public team pages
-- can be served at /team/<slug> instead of /team/<uuid>. Existing rows are
-- backfilled by slugifying the team name; collisions are resolved by
-- appending -2, -3, ... A BEFORE INSERT trigger auto-generates a slug for
-- any new team that doesn't provide one explicitly.
--
-- The column is left nullable + uses a partial UNIQUE index, so the
-- migration is safe to run even if a row briefly exists with NULL slug
-- before the trigger or backfill runs.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Slugify helper:
--   "FC Barcelone" -> "fc-barcelone"
--   "  Équipe — n°7  " -> "equipe-n-7"
--   ""  / NULL -> "team"
-- Truncated to 64 chars to keep URLs short.
CREATE OR REPLACE FUNCTION public.slugify_text(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  IF input IS NULL OR length(btrim(input)) = 0 THEN
    RETURN 'team';
  END IF;
  s := lower(public.unaccent(input));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  IF length(s) = 0 THEN
    RETURN 'team';
  END IF;
  RETURN substring(s FROM 1 FOR 64);
END;
$$;

COMMENT ON FUNCTION public.slugify_text(text)
  IS 'URL-safe slug from arbitrary text: lowercase, accent-stripped, [a-z0-9-], trimmed to 64 chars.';

-- 1) Add the column (nullable so the backfill can run before the unique index).
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS slug text;

COMMENT ON COLUMN public.teams.slug
  IS 'URL-friendly identifier used in /team/<slug>. Auto-generated from name on insert if not provided.';

-- 2) Backfill existing rows with a unique slug derived from the team name.
DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  counter int;
BEGIN
  FOR r IN
    SELECT id, name FROM public.teams
    WHERE slug IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    base_slug := public.slugify_text(r.name);
    candidate := base_slug;
    counter := 2;
    WHILE EXISTS (
      SELECT 1 FROM public.teams
      WHERE slug = candidate AND id <> r.id
    ) LOOP
      candidate := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    UPDATE public.teams SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Enforce uniqueness on non-null slugs.
CREATE UNIQUE INDEX IF NOT EXISTS teams_slug_unique_idx
  ON public.teams (slug)
  WHERE slug IS NOT NULL;

-- 4) Trigger: auto-generate slug on INSERT when missing.
CREATE OR REPLACE FUNCTION public.teams_set_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  candidate text;
  counter int;
BEGIN
  IF NEW.slug IS NULL OR length(btrim(NEW.slug)) = 0 THEN
    base_slug := public.slugify_text(NEW.name);
    candidate := base_slug;
    counter := 2;
    WHILE EXISTS (
      SELECT 1 FROM public.teams
      WHERE slug = candidate AND id IS DISTINCT FROM NEW.id
    ) LOOP
      candidate := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_set_slug_trigger ON public.teams;
CREATE TRIGGER teams_set_slug_trigger
BEFORE INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.teams_set_slug();

COMMENT ON FUNCTION public.teams_set_slug()
  IS 'Fills teams.slug from teams.name when missing on INSERT, ensuring uniqueness.';
