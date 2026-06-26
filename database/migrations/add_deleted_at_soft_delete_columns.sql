-- Migration: harmoniser le soft-delete via `deleted_at` (multi-tables) — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Source historique (loose, non versionnée) : database/deleted_at_migration.sql
--
-- WHY:
--   Le pattern soft-delete `deleted_at TIMESTAMPTZ` a été ajouté en prod à un lot
--   de tables (teams, tournament_stages, matches, announcements, partners,
--   cast_members, adherents) via un fichier loose jamais versionné, avec backfill
--   depuis les anciens marqueurs (is_active=false / status='cancelled') et des
--   index partiels pour les vues "corbeille" (deleted_at IS NOT NULL).
--   On versionne ce patch à l'identique pour rendre la base reconstructible.
--   Aucun changement de comportement.
--
-- WHAT:
--   - ADD COLUMN deleted_at (guard information_schema, idempotent) sur les 7 tables.
--   - Backfill deleted_at depuis is_active=false / status='cancelled'
--     (guard `deleted_at IS NULL` -> ré-exécutable sans double effet).
--   - Index partiels idx_<table>_deleted_at WHERE deleted_at IS NOT NULL.
--
-- EXCLUSION VOLONTAIRE (par rapport au fichier loose d'origine) :
--   Le fichier loose terminait par un DROP+ADD du CHECK `demandes_type_check`
--   pour y AJOUTER la valeur 'team_registration'. Cette mutation N'EST PAS
--   reprise ici car la chaîne de migrations dédiées la gère déjà et l'étend
--   davantage (add_transfer_type_to_demandes.sql, add_invite_type_to_demandes.sql,
--   add_caster_application_type_to_demandes.sql). La rejouer ici à l'état
--   'team_registration' RÉTRÉCIRAIT le check sur une base reconstruite si cette
--   migration s'appliquait après les autres -> on l'exclut pour ne jamais perdre
--   de valeurs de type. Le check final reste piloté par ces migrations dédiées.
--
-- CAVEATS:
--   - Idempotente (guards information_schema + ADD INDEX IF NOT EXISTS + backfill
--     gardé par deleted_at IS NULL).
--   - Purement additive (colonnes + index), pas de FK/RLS -> pas de reload du
--     schema cache PostgREST requis.
--   - Dépend des 7 tables ciblées (toutes en prod). Note : `announcements` est
--     désormais versionnée par create_announcements_table.sql.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'deleted_at') THEN
    ALTER TABLE teams ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_stages' AND column_name = 'deleted_at') THEN
    ALTER TABLE tournament_stages ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'deleted_at') THEN
    ALTER TABLE matches ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'deleted_at') THEN
    ALTER TABLE announcements ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partners' AND column_name = 'deleted_at') THEN
    ALTER TABLE partners ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cast_members' AND column_name = 'deleted_at') THEN
    ALTER TABLE cast_members ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adherents' AND column_name = 'deleted_at') THEN
    ALTER TABLE adherents ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Back-fill deleted_at depuis les anciens marqueurs (ré-exécutable).
UPDATE teams             SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false       AND deleted_at IS NULL;
UPDATE tournament_stages SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false       AND deleted_at IS NULL;
UPDATE matches           SET deleted_at = COALESCE(updated_at, NOW()) WHERE status = 'cancelled'    AND deleted_at IS NULL;
UPDATE announcements     SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false       AND deleted_at IS NULL;
UPDATE partners          SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false       AND deleted_at IS NULL;
UPDATE cast_members      SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false       AND deleted_at IS NULL;
UPDATE adherents         SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false       AND deleted_at IS NULL;

-- Index partiels pour les requêtes corbeille (deleted_at IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_teams_deleted_at             ON teams(deleted_at)             WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_stages_deleted_at ON tournament_stages(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_deleted_at           ON matches(deleted_at)           WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_deleted_at     ON announcements(deleted_at)     WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partners_deleted_at          ON partners(deleted_at)          WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cast_members_deleted_at      ON cast_members(deleted_at)      WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_adherents_deleted_at         ON adherents(deleted_at)         WHERE deleted_at IS NOT NULL;
