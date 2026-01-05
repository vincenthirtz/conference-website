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
