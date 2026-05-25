-- Migration: étend tournaments_game_check pour LoL + Dota 2
-- Date: 2026-05-26
--
-- WHY:
--   Ajout de deux MOBA dans config/games/index.ts :
--     - 'lol'   → League of Legends
--     - 'dota2' → Dota 2
--   Ces jeux n'utilisent pas de map veto (1 seule map) mais une phase
--   de draft de champions/héros (cf. create_draft_tables_for_lol_dota.sql).
--
-- DEPLOY NOTES:
--   - Idempotent (DROP CONSTRAINT IF EXISTS + ADD).
--   - À appliquer APRÈS create_draft_tables_for_lol_dota.sql.

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
      'marvel-rivals',
      'lol',
      'dota2'
    )
  );

COMMENT ON COLUMN public.tournaments.game IS
  'Slug du jeu, aligné sur GAME_SLUGS dans config/games/index.ts. NULL autorisé pour les tournois legacy. Valeurs : overwatch | valorant | cs2 | rocket-league | r6-siege | marvel-rivals | lol | dota2.';

COMMIT;
