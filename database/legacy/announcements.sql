-- ARCHIVÉ le 2026-06-26 : versionné dans migrations/create_announcements_table.sql
--   (DDL repris à l'identique). RLS / tenant_id / deleted_at portés par leurs
--   migrations dédiées. Conservé pour historique — NE PAS exécuter, NE PAS appliquer.
-- =====================================================================

-- Table: public.announcements
-- Bandeau d'annonces publicitaires / messages sponsorisés affichés sur la home.

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  message text NOT NULL,
  cta_label text,
  cta_url text,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_active_priority_idx
  ON public.announcements (is_active, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS announcements_starts_at_idx
  ON public.announcements (starts_at);

CREATE INDEX IF NOT EXISTS announcements_ends_at_idx
  ON public.announcements (ends_at);

-- Trigger pour tenir updated_at à jour
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS announcements_update_updated_at ON public.announcements;
CREATE TRIGGER announcements_update_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
