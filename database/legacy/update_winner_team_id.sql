-- ARCHIVÉ le 2026-06-26 : DATA FIX one-shot (backfill winner_team_id des matches
--   terminés à partir des scores). Effet ponctuel, déjà appliqué en prod. Idempotent
--   par nature (ne touche que winner_team_id IS NULL) mais sans valeur de schéma.
--   NON versionné. Conservé pour historique uniquement.
-- =====================================================================

-- ============================================================
-- Script: Mise à jour de winner_team_id pour les matchs terminés
-- Description: Remplit winner_team_id basé sur les scores pour
--              les matchs qui ont des scores mais pas de gagnant défini
-- ============================================================

-- 1) Vérification : Compter les matchs qui seront mis à jour
SELECT
  COUNT(*) as matchs_a_mettre_a_jour,
  COUNT(CASE WHEN team1_score > team2_score THEN 1 END) as victoires_team1,
  COUNT(CASE WHEN team2_score > team1_score THEN 1 END) as victoires_team2
FROM matches
WHERE status IN ('finished', 'completed', 'done')
  AND winner_team_id IS NULL
  AND team1_score IS NOT NULL
  AND team2_score IS NOT NULL
  AND team1_score != team2_score;

-- 2) Voir les matchs concernés avant mise à jour (optionnel)
-- SELECT
--   id,
--   status,
--   team1_id,
--   team2_id,
--   team1_score,
--   team2_score,
--   winner_team_id
-- FROM matches
-- WHERE status IN ('finished', 'completed', 'done')
--   AND winner_team_id IS NULL
--   AND team1_score IS NOT NULL
--   AND team2_score IS NOT NULL
--   AND team1_score != team2_score
-- LIMIT 20;

-- 3) MISE À JOUR : Définir winner_team_id basé sur les scores
UPDATE matches
SET
  winner_team_id = CASE
    WHEN team1_score > team2_score THEN team1_id
    WHEN team2_score > team1_score THEN team2_id
    ELSE NULL
  END,
  updated_at = NOW()
WHERE status IN ('finished', 'completed', 'done')
  AND winner_team_id IS NULL
  AND team1_score IS NOT NULL
  AND team2_score IS NOT NULL
  AND team1_score != team2_score;

-- 4) Vérification après mise à jour
SELECT
  COUNT(*) as total_matchs_termines,
  COUNT(winner_team_id) as avec_gagnant,
  COUNT(*) - COUNT(winner_team_id) as sans_gagnant_ou_nul
FROM matches
WHERE status IN ('finished', 'completed', 'done');
