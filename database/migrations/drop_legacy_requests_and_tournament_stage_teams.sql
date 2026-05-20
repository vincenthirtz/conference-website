-- Migration: drop legacy `requests` + `tournament_stage_teams` tables (pré-Phase 1 multi-tenant)
-- Date: 2026-05-20
--
-- WHY:
--   Audit multi-tenant du 2026-05-20 : deux tables fantômes identifiées,
--   toutes les deux avec 0 rows et 0 référence dans le code applicatif
--   (`pages/`, `utils/`, `tests/`) ni dans aucune vue/fonction Postgres
--   actuelle. On les drop AVANT la Phase 1 pour ne pas avoir à propager
--   un `tenant_id` sur des tables mortes (et alourdir l'audit pour rien).
--
--   1. `public.requests` (0 rows) :
--      Vestige d'une itération précédente où la table `demandes` (qui est
--      la table active utilisée par l'app) s'appelait probablement
--      `requests` en anglais avant le rename FR.
--
--   2. `public.tournament_stage_teams` (0 rows, 0 référence code) :
--      Doublon mort de `stage_teams` (la table active). Mêmes colonnes
--      sémantiques, jamais peuplée. Reliquat probable d'une migration
--      où la table a été renommée mais l'ancienne n'a pas été droppée.
--
-- ROLLBACK:
--   Les deux structures sont simples et 0 row à sauvegarder donc rollback
--   = re-create + done. La structure exacte est récupérable via
--   `git log --all -- database/migrations/` ou via un snapshot Supabase
--   pre-2026-05-20 si besoin. Pas de DDL de rollback embedded ici car
--   on ne veut PAS qu'un copier-coller accidentel ré-introduise ces
--   tables mortes.
--
-- CAVEATS:
--   - Idempotente : DROP IF EXISTS.
--   - CASCADE pour nettoyer les éventuels constraints/index orphelins.
--   - PostgREST schema cache reload conseillé après application
--     (suppression de tables → cache obsolète, l'API exposait encore
--     ces endpoints).
--   - Si une investigation future montre qu'une de ces tables était en
--     fait consommée par un job/cron externe non versionné dans ce repo,
--     restaurer depuis backup avant J+1.

BEGIN;

-- 1) Drop `requests` (doublon mort de `demandes`)
DROP TABLE IF EXISTS public.requests CASCADE;

-- 2) Drop `tournament_stage_teams` (doublon mort de `stage_teams`)
DROP TABLE IF EXISTS public.tournament_stage_teams CASCADE;

COMMIT;

-- PostgREST schema cache reload : les endpoints `/rest/v1/requests` et
-- `/rest/v1/tournament_stage_teams` doivent disparaître de l'OpenAPI.
NOTIFY pgrst, 'reload schema';
