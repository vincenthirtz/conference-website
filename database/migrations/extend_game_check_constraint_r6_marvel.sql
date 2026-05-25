-- Migration: étend tournaments_game_check pour R6 Siege + Marvel Rivals
-- Date: 2026-05-26
--
-- WHY:
--   Ajout de deux jeux supportés dans config/games/index.ts :
--     - 'r6-siege'      → Rainbow Six Siege
--     - 'marvel-rivals' → Marvel Rivals
--   La CHECK constraint posée par add_game_check_constraint_to_tournaments.sql
--   refusait ces valeurs. On la recrée avec l'enum élargi.
--
-- DEPLOY NOTES:
--   - Idempotent (DROP CONSTRAINT IF EXISTS + ADD).
--   - Aucune normalisation requise (pas de tournoi historique sur ces jeux).
--   - Pas de RLS impactée, pas de FK touchée.
--
-- ROLLBACK:
--   Recréer la constraint avec l'enum d'origine (4 slugs) — ne pas oublier
--   de mettre à NULL les tournois éventuels créés sur les 2 nouveaux slugs
--   avant le rollback.

BEGIN;

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_game_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_game_check
  CHECK (
    game IS NULL
    OR game IN (
      'overwatch',
      'valorant',
      'cs2',
      'rocket-league',
      'r6-siege',
      'marvel-rivals'
    )
  );

COMMENT ON COLUMN public.tournaments.game IS
  'Slug du jeu, aligné sur GAME_SLUGS dans config/games/index.ts. NULL autorisé pour les tournois legacy non taggés. Valeurs : overwatch | valorant | cs2 | rocket-league | r6-siege | marvel-rivals.';

COMMIT;
