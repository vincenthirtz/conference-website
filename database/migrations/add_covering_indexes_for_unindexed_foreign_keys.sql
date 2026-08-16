-- Migration: index couvrants pour les 7 clés étrangères non indexées
-- Date: 2026-08-17
--
-- WHY:
--   Le linter de performance Supabase (`unindexed_foreign_keys`) relève 7 FK
--   sans index couvrant. Deux coûts concrets :
--     1. LECTURE — toute jointure ou tout filtre sur la colonne FK part en
--        seq scan. Ex. `support_tickets` filtré par blacklist convertie,
--        `tasks` filtré par créateur (board Kanban), `team_reviews` filtré par
--        équipe adverse (fiche équipe publique).
--     2. ÉCRITURE — Postgres doit vérifier l'absence de lignes référençantes
--        à chaque DELETE / UPDATE de la clé côté parent. Sans index, c'est un
--        seq scan de la table enfant par ligne parente supprimée.
--
-- WHAT:
--   Un index B-tree simple sur la colonne portant chaque FK :
--     - entity_blacklist.banned_by
--     - scrim_score_reports.tenant_id
--     - scrims.winner_team_id
--     - support_tickets.converted_entity_blacklist_id
--     - support_tickets.converted_player_blacklist_id
--     - tasks.created_by
--     - team_reviews.opponent_team_id
--
-- CAVEATS:
--   - Idempotente : `CREATE INDEX IF NOT EXISTS`.
--   - Pas de CONCURRENTLY : les tables concernées sont petites et le
--     connecteur applique les migrations dans une transaction (CONCURRENTLY y
--     est interdit). Si l'une de ces tables grossit fortement, refaire l'index
--     en CONCURRENTLY hors transaction.
--   - Aucun changement de schéma logique : pas de reload du cache PostgREST
--     nécessaire (aucune FK ni colonne ajoutée).

CREATE INDEX IF NOT EXISTS idx_entity_blacklist_banned_by
  ON public.entity_blacklist (banned_by);

CREATE INDEX IF NOT EXISTS idx_scrim_score_reports_tenant_id
  ON public.scrim_score_reports (tenant_id);

CREATE INDEX IF NOT EXISTS idx_scrims_winner_team_id
  ON public.scrims (winner_team_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_converted_entity_blacklist_id
  ON public.support_tickets (converted_entity_blacklist_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_converted_player_blacklist_id
  ON public.support_tickets (converted_player_blacklist_id);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by
  ON public.tasks (created_by);

CREATE INDEX IF NOT EXISTS idx_team_reviews_opponent_team_id
  ON public.team_reviews (opponent_team_id);
