-- Migration : objectifs d'avant-match sur les revues d'équipe (lot J5 de
-- docs/PLAN-espace-joueur.md).
--
-- Le métier de coach est une BOUCLE : on fixe deux ou trois intentions avant le
-- match, on regarde après si elles ont tenu. Le site portait la seconde moitié
-- (les revues, N2) et pas la première — les intentions vivaient sur Discord,
-- c'est-à-dire nulle part au moment de la revue.
--
-- La colonne vit sur `team_reviews` et pas dans une table à part, parce que
-- c'est la MÊME ligne : même équipe, même affrontement, même clé unique
-- (team_id, subject_type, subject_id). Une revue peut donc naître AVANT le
-- match (objectifs seuls) et se compléter après (notes, VOD) — c'est
-- exactement la boucle qu'on veut rendre visible.
--
-- Conséquence sur la règle « une revue vide n'existe pas » : le vide se juge
-- désormais sur les TROIS champs (cf. utils/teams/teamReviews.ts).
--
-- Idempotente.

BEGIN;

ALTER TABLE public.team_reviews
  ADD COLUMN IF NOT EXISTS objectives text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_reviews_objectives_len'
  ) THEN
    ALTER TABLE public.team_reviews
      ADD CONSTRAINT team_reviews_objectives_len
      CHECK (objectives IS NULL OR char_length(objectives) <= 2000);
  END IF;
END $$;

COMMIT;
