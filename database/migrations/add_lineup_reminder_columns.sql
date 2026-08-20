-- Migration: add_lineup_reminder_columns.sql
-- Date: 2026-08-21
--
-- WHY:
--   Le check-in a tout un dispositif de relance — email à T-60, rappels
--   Discord à T-30 et T-15, forfait automatique à T-0. La feuille de match,
--   elle, n'avait rien : une équipe qui cochait son check-in et fermait
--   l'onglet repartait sans composition, et retombait donc sur le vieux
--   comportement (roster figé au moment de la saisie du score, cf.
--   add_match_lineups.sql).
--
--   Le rappel vise l'exact COMPLÉMENT des rappels existants : ceux-ci pinguent
--   les équipes qui n'ont PAS fait leur check-in, celui-ci pingue celles qui
--   l'ont fait et n'ont pas validé leur feuille.
--
-- WHAT:
--   Deux marqueurs d'idempotence, un par côté, sur le modèle exact des
--   colonnes `teamN_captain_dm_30_sent_at` déjà présentes.
--
-- POURQUOI PAR ÉQUIPE ET PAS PAR MATCH:
--   Les rappels de check-in sont gated par UN marqueur de match
--   (`reminder_15_sent_at`) parce qu'ils partent au même instant pour les deux
--   côtés. Ici non : l'équipe A peut faire son check-in à T-50 et valider dans
--   la foulée, pendant que l'équipe B coche à T-16. Un marqueur unique
--   partirait sur A, se poserait, et B ne serait jamais relancée — précisément
--   l'équipe qui en a besoin.
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS).
--   - Colonnes nullables sans défaut : NULL = « jamais relancée », ce que
--     lisent les gardes côté application.
--   - Aucun backfill : les matches passés n'ont pas à être relancés.

BEGIN;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS team1_lineup_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS team2_lineup_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.matches.team1_lineup_reminder_sent_at IS
  'Marqueur d''idempotence du rappel « feuille de match » pour l''équipe 1. '
  'Par équipe et non par match : les deux côtés ne font pas leur check-in au '
  'même moment, et c''est le check-in qui ouvre la feuille.';

COMMENT ON COLUMN public.matches.team2_lineup_reminder_sent_at IS
  'Idem pour l''équipe 2.';

COMMIT;
