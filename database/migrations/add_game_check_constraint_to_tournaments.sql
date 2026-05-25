-- Migration: contrainte CHECK sur tournaments.game (multi-game support)
-- Date: 2026-05-26
--
-- WHY:
--   Le registry applicatif `config/games/index.ts` déclare GAME_SLUGS =
--     ['overwatch', 'valorant', 'cs2', 'rocket-league']
--   La validation API rejette désormais toute valeur hors de cet enum.
--   La colonne `tournaments.game` (TEXT NULL) acceptait jusque-là n'importe
--   quelle string, ce qui a produit des variantes legacy en prod :
--     - 'Overwatch'    (capitalisé)
--     - 'Overwatch 2'  (suffixe "2")
--   Cette migration aligne la DB sur le contrat applicatif :
--     1. Normalise les valeurs existantes (LOWER + TRIM + mapping aliases).
--     2. Met à NULL toute valeur non reconnue (avec NOTICE pour traçabilité),
--        plutôt que de faire échouer la migration sur des tournois historiques
--        mal taggés.
--     3. Ajoute la contrainte CHECK tournaments_game_check.
--
-- DEPLOY NOTES:
--   - Idempotent : DROP CONSTRAINT IF EXISTS avant ADD CONSTRAINT.
--   - Le bloc DO PL/pgSQL est rejouable (les UPDATE convergent vers un état
--     stable : seconde exécution = 0 row touchée).
--   - Pas de FK touchée → pas de reload du cache PostgREST nécessaire.
--   - Pas de RLS impactée.
--   - Valeurs constatées en prod au moment de l'écriture (à titre indicatif) :
--       'Overwatch'   x2   → 'overwatch'
--       'Overwatch 2' x1   → 'overwatch'
--     Aucun row inattendu détecté.
--
-- ROLLBACK:
--   ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_game_check;
--   (Les normalisations de valeurs ne sont pas rollbackées — elles sont
--    considérées comme un fix de qualité de donnée.)

BEGIN;

-- 1) Normalisation des valeurs existantes
DO $$
DECLARE
  unknown_row RECORD;
BEGIN
  -- Lowercase + trim systématique
  UPDATE public.tournaments
     SET game = LOWER(TRIM(game))
   WHERE game IS NOT NULL
     AND game <> LOWER(TRIM(game));

  -- Mapping des alias Overwatch connus → 'overwatch'
  UPDATE public.tournaments
     SET game = 'overwatch'
   WHERE game IN ('overwatch 2', 'ow', 'ow2');

  -- Toute valeur non-NULL qui n'est PAS dans l'enum cible → NULL + NOTICE
  FOR unknown_row IN
    SELECT id, game
      FROM public.tournaments
     WHERE game IS NOT NULL
       AND game NOT IN ('overwatch', 'valorant', 'cs2', 'rocket-league')
  LOOP
    RAISE NOTICE 'tournaments_game_check: setting game=NULL on tournament id=% (legacy value: %)',
      unknown_row.id, unknown_row.game;
  END LOOP;

  UPDATE public.tournaments
     SET game = NULL
   WHERE game IS NOT NULL
     AND game NOT IN ('overwatch', 'valorant', 'cs2', 'rocket-league');
END $$;

-- 2) Contrainte CHECK : NULL autorisé, sinon ∈ enum applicatif
ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_game_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_game_check
  CHECK (game IS NULL OR game IN ('overwatch', 'valorant', 'cs2', 'rocket-league'));

COMMENT ON COLUMN public.tournaments.game IS
  'Slug du jeu, aligné sur GAME_SLUGS dans config/games/index.ts. NULL autorisé pour les tournois legacy non taggés. Valeurs : overwatch | valorant | cs2 | rocket-league.';

COMMIT;
