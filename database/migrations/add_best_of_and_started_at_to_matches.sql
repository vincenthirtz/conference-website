-- Migration: colonnes best_of et started_at sur matches
--
-- WHY: la page /admin/scrims/[id] échouait au chargement. Son appel à
--   GET /api/admin/scrims/:id/matches répondait 500 parce que le handler
--   sélectionne `best_of` et `started_at` — deux colonnes que la base de
--   PRODUCTION n'a jamais eues. PostgREST rejette la requête entière
--   (42703 undefined_column), donc l'endpoint tombe, donc le Promise.all de
--   la page rejette et l'écran affiche une erreur.
--
--   Ce n'est pas le code qui est en trop : tout l'attend déjà — les selects
--   admin ET bot des matchs de scrim, l'export de résultats, le clonage et le
--   bulk-create de stage, les types (types/admin.ts, types/caster.ts), le
--   fallback de format côté caster (utils/caster/matchPickerFormat.ts, où
--   `best_of` NULL retombe sur `match_format`), et jusqu'aux seeds e2e qui
--   insèrent ces colonnes. C'est le schéma de production qui a dérivé.
--
-- WHAT (additif, non-destructif, réversible par DROP COLUMN) :
--   - best_of    : nombre de manches du match. NULL = pas de surcharge, on
--                  déduit du texte `match_format` ('bo3' → 3, défaut 5).
--   - started_at : horodatage de démarrage réel, posé par le bot au passage
--                  du match en 'running' (à distinguer de `scheduled_at`,
--                  l'heure prévue, et de `completed_at`).
--
--   Aucune valeur par défaut : les lignes existantes restent à NULL, ce que
--   tout le code lit déjà comme « non renseigné ». Pas de FK ajoutée, donc
--   pas de reload du cache de schéma PostgREST à prévoir.

BEGIN;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS best_of integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

COMMENT ON COLUMN public.matches.best_of IS
  'Nombre de manches. NULL = déduit de match_format (cf. utils/caster/matchPickerFormat.ts).';
COMMENT ON COLUMN public.matches.started_at IS
  'Démarrage réel du match (posé au passage en running). Distinct de scheduled_at (prévu).';

COMMIT;
