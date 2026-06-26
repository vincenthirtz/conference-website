-- Migration: créer la table `announcements` (+ trigger updated_at) — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Source historique (loose, non versionnée) : database/announcements.sql
--
-- WHY:
--   Bandeau d'annonces affiché sur la home (pages/index.tsx) et géré via
--   /api/admin/announcements/*. La table a été créée en prod par un fichier loose
--   jamais versionné. Plusieurs migrations ultérieures la supposent déjà présente
--   (add_tenant_id_to_tier1_tables.sql ajoute tenant_id, deleted_at_migration.sql
--   ajoute deleted_at, add_admin_pagination_indexes.sql, etc.).
--   On versionne le DDL d'origine à l'identique pour rendre la base
--   reconstructible. Aucun changement de comportement.
--
-- WHAT:
--   - CREATE TABLE IF NOT EXISTS public.announcements (identique au loose).
--   - Index (is_active, priority DESC, created_at DESC) + starts_at + ends_at.
--   - Trigger updated_at via public.update_updated_at_column().
--   Les colonnes ajoutées plus tard (tenant_id, deleted_at) restent gérées par
--   leurs migrations dédiées — on ne les anticipe PAS ici (fidélité à l'origine).
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS).
--   - RLS : NON activé ici. La baseline RLS de cette table est portée par
--     enable_rls_remaining_tables.sql / enable_rls_baseline_tables.sql.
--   - Requiert uuid_generate_v4 (extension uuid-ossp) déjà présente en prod.
--   - Pas de FK ajoutée -> pas de reload du schema cache PostgREST requis.

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

-- Fonction générique de maintien de updated_at (partagée, idempotente).
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
