-- Migration: index couvrants pour les foreign keys de scrim_plannings
-- Date: 2026-07-15
--
-- WHY: l'advisor Supabase (0001 unindexed_foreign_keys) signale 3 FK de
--   public.scrim_plannings sans index couvrant : scrim_id, team1_id, team2_id.
--   Les index composites déjà posés par add_scrim_plannings.sql
--   ((tenant_id, team1_id) et (tenant_id, team2_id)) NE couvrent PAS ces FK :
--   la colonne FK n'est pas en tête de l'index, donc Postgres ne peut pas s'en
--   servir pour les vérifications de FK ni pour les cascades ON DELETE des
--   tables référencées (scrims, teams). D'où des scans séquentiels sur les
--   suppressions/jointures par ces colonnes seules.
--
-- WHAT (additif, non-destructif): un index btree simple par colonne FK, avec la
--   colonne FK en position de tête. Idempotent (IF NOT EXISTS).
--
-- CAVEATS:
--   - Pas de reload du cache PostgREST nécessaire (aucune FK ajoutée/modifiée,
--     uniquement des index).
--   - Re-runnable sans nettoyage manuel.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_scrim_plannings_scrim_id
  ON public.scrim_plannings (scrim_id);

CREATE INDEX IF NOT EXISTS idx_scrim_plannings_team1_id
  ON public.scrim_plannings (team1_id);

CREATE INDEX IF NOT EXISTS idx_scrim_plannings_team2_id
  ON public.scrim_plannings (team2_id);

COMMIT;
