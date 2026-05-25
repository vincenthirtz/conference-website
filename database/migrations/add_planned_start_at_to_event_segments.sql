-- Migration: ajout de la colonne `planned_start_at` sur `event_segments`
-- Date: 2026-05-25
--
-- WHY:
--   Lot 6 de la feature "Run-of-show" (timing/drift). Mode HYBRIDE pour le
--   calcul du "planned time" d'un segment :
--
--     - planned_start_at IS NULL (cas par défaut) :
--         le planned est calculé à la volée côté UI/API depuis
--         event_runs.scheduled_at + sum(duration_min) des segments précédents
--         dans le même run. C'est le mode courant : le Director laisse la
--         timeline "flotter" relativement à l'heure de départ du run.
--
--     - planned_start_at IS NOT NULL :
--         ancrage absolu explicite. Le Director a décidé "ce segment commence
--         à HH:MM, peu importe ce qui s'est passé avant". Use case prime-time :
--         le match d'ouverture est annoncé à 21h00 sharp sur les réseaux, on
--         l'ancre, et la dérive éventuelle du briefing/intro avant ne décale
--         pas l'heure d'antenne du match. Le Cockpit caster et la vue Director
--         affichent un cadenas sur les segments ancrés.
--
--   Le timing/drift est calculé côté API à partir de planned (computed OU
--   ancré selon la colonne) vs started_at/now() pour produire ahead / on-time
--   / behind.
--
-- CAVEATS:
--   - Idempotente : ADD COLUMN IF NOT EXISTS.
--   - Pas de backfill : la valeur par défaut NULL = mode "computed" qui est
--     exactement le comportement actuel (avant ce lot). Aucun segment
--     existant ne doit être touché.
--   - Pas d'index ajouté : la colonne sert uniquement au rendu UI scopé par
--     event_run_id (déjà couvert par l'index unique
--     event_segments_run_ord_unique). Aucun filtre/order direct sur
--     planned_start_at en V1.
--   - Pas de CHECK constraint (ex. planned_start_at >= run.scheduled_at) :
--     un Director peut légitimement vouloir ancrer un segment "tôt" pour
--     forcer un rattrapage, et la cohérence sémantique est validée
--     côté API/UI, pas en DB.
--   - PostgREST schema cache reload requis (nouvelle colonne exposée via
--     les routes admin/events qui font SELECT *).

BEGIN;

ALTER TABLE public.event_segments
  ADD COLUMN IF NOT EXISTS planned_start_at timestamptz;

COMMENT ON COLUMN public.event_segments.planned_start_at IS
  'Ancrage horaire absolu optionnel (override du Director). NULL = computed (run.scheduled_at + sum durations précédents). Set = ancré, UI affiche un cadenas.';

-- Pas d'index : la colonne sert au rendu UI (lookup par event_run_id déjà
-- couvert par l'index existant), pas de filtre/ordre direct dessus.

COMMIT;

NOTIFY pgrst, 'reload schema';
