-- Migration: broadcast state cockpit on event_runs (Lot 7)
--
-- WHY:
--   Le Live Director gère déjà la timeline d'un event_run (segments) mais ne
--   couvre PAS l'état "broadcast" associé : texte lower-third visible à
--   l'écran, picture-in-picture on/off, "on air" effectif (le bot publie un
--   panneau Discord uniquement quand on_air=true).
--
--   Pour V1 on évite une nouvelle table : un seul `broadcast_state` JSONB
--   sur `event_runs` capture tout l'état overlay + on_air. Le shape est
--   versionné (`v: 1`) pour permettre une migration souple plus tard si on
--   ajoute des overlays.
--
-- SHAPE INITIAL (v:1) :
--   {
--     "v": 1,
--     "on_air": false,
--     "lower_third": null,        // string | null  — texte affiché bas écran
--     "pip": { "enabled": false } // overlay PiP optionnel
--   }
--
-- DEPLOY NOTES:
--   - Idempotent (IF NOT EXISTS, DROP CONSTRAINT IF EXISTS).
--   - Pas de FK / RLS touché donc pas de reload PostgREST nécessaire.

ALTER TABLE public.event_runs
  ADD COLUMN IF NOT EXISTS broadcast_state JSONB NOT NULL DEFAULT
    '{"v":1,"on_air":false,"lower_third":null,"pip":{"enabled":false}}'::jsonb;

COMMENT ON COLUMN public.event_runs.broadcast_state IS
  'Lot 7 Broadcast Console : état overlay/on-air du run. JSONB v:1 = { on_air bool, lower_third text|null, pip { enabled bool } }. Modifié uniquement via POST /api/admin/broadcast/state.';
