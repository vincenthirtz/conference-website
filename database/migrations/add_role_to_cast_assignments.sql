-- Migration: rétablit cast_assignments.role (lu par /api/caster/me)
--
-- WHY: `pages/api/caster/me.ts` sélectionne `role` sur `cast_assignments`
--   (rôle du caster sur l'assignation : play-by-play / color / host…), mais la
--   colonne avait disparu de la table (probablement lors du refactor « Lot 9 »
--   polymorphique match/scrim). Résultat : `column cast_assignments.role does
--   not exist` → 500 sur /api/caster/me pour TOUT caster atteignant le cockpit
--   (bug live depuis ≥24h, masqué jusqu'ici car les casters sans fiche étaient
--   bloqués en amont par le gate CASTER_NOT_LINKED).
--
-- WHAT (additif, non-destructif): recrée `role text` nullable. La création
--   d'assignation n'écrit pas ce champ aujourd'hui (il restera NULL), donc le
--   cockpit affiche les assignations sans libellé de rôle — comportement
--   correct et non bloquant, forward-compatible si l'attribution d'un rôle est
--   ajoutée plus tard à l'UI d'assignation.
--
-- CAVEATS: idempotent (IF NOT EXISTS). Colonne ajoutée => reload du cache
--   PostgREST requis pour que l'API la reconnaisse (NOTIFY ci-dessous).

BEGIN;

ALTER TABLE public.cast_assignments
  ADD COLUMN IF NOT EXISTS role text;

COMMENT ON COLUMN public.cast_assignments.role IS
  'Rôle du caster sur cette assignation (play-by-play / color / host…). Nullable ; lu par /api/caster/me. Non renseigné à la création pour l''instant.';

COMMIT;

-- Recharge le cache de schéma PostgREST pour exposer la nouvelle colonne.
NOTIFY pgrst, 'reload schema';
