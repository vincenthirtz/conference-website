-- ARCHIVÉ le 2026-06-26 : SUPERSÉDÉ / OBSOLÈTE.
--   Ce script imposait team_members.battle_tag NOT NULL ; la colonne a depuis été
--   rendue NULLABLE par migrations/relax_team_members_battle_tag_nullable.sql (Lot 6).
--   Rejouer ce fichier RÉGRESSERAIT l'état prod (réimpose NOT NULL + DEFAULT + CHECK +
--   UPDATE des lignes). NE PAS exécuter. La contrainte de format et la colonne
--   existent déjà en prod ; rien à versionner. Conservé pour historique uniquement.
-- =====================================================================

-- Ajout du BattleTag obligatoire sur les membres d'équipe
ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS battle_tag text NOT NULL DEFAULT 'Unknown#0000';

COMMENT ON COLUMN public.team_members.battle_tag IS 'BattleTag Battle.net au format Pseudo#0000';

-- Optionnel : contrainte de format simple (alphanum + # + 3 à 6 chiffres)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'team_members_battletag_format'
  ) THEN
    ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_battletag_format
    CHECK (battle_tag ~ '^[A-Za-z0-9]{2,}#[0-9]{3,6}$');
  END IF;
END;
$$;

-- Normalise les anciennes lignes si besoin
UPDATE public.team_members
SET battle_tag = 'Unknown#0000'
WHERE battle_tag IS NULL OR battle_tag = '';
