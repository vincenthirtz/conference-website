-- database/migrations/create_scrims_table.sql
-- Migration : creation de l'entite "scrims" (journee de matchs amicaux entre 2 equipes)
-- + ajout de la colonne scrim_id sur la table matches
--
-- Un scrim = une session datee entre exactement 2 equipes, contenant 1..N
-- matchs amicaux. Les matchs reutilisent la table matches existante.
--
-- Reversible : DROP TABLE scrims CASCADE; ALTER TABLE matches DROP COLUMN scrim_id;
--              ALTER TABLE matches ALTER COLUMN tournament_id SET NOT NULL;
--              (la NOT NULL n'est restorable que si aucune ligne n'a tournament_id IS NULL)

BEGIN;

/* -----------------------------------------------------------
 * 1) Table scrims
 * ---------------------------------------------------------*/

CREATE TABLE IF NOT EXISTS scrims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name        text NOT NULL,
  slug        text UNIQUE,
  game        text,

  -- Cycle de vie : draft -> scheduled -> running -> completed | cancelled
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled')),

  -- Les deux equipes du scrim (toujours 2)
  team1_id    uuid REFERENCES teams(id) ON DELETE SET NULL,
  team2_id    uuid REFERENCES teams(id) ON DELETE SET NULL,
  CONSTRAINT scrims_distinct_teams CHECK (team1_id IS NULL OR team2_id IS NULL OR team1_id <> team2_id),

  -- Planification
  scheduled_date    timestamptz,
  timezone          text DEFAULT 'Europe/Paris',

  -- Visibilite
  is_public   boolean NOT NULL DEFAULT false,

  -- Habillage / contenu
  logo_url    text,
  banner_url  text,
  description text,
  stream_url  text,

  -- Lien avec la demande qui a genere le scrim (si applicable)
  source_demande_id uuid REFERENCES demandes(id) ON DELETE SET NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

COMMENT ON TABLE scrims IS 'Sessions de matchs amicaux (scrims) entre deux equipes.';

CREATE INDEX IF NOT EXISTS idx_scrims_status         ON scrims (status);
CREATE INDEX IF NOT EXISTS idx_scrims_scheduled_date ON scrims (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scrims_is_public      ON scrims (is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_scrims_team1_id       ON scrims (team1_id) WHERE team1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scrims_team2_id       ON scrims (team2_id) WHERE team2_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scrims_source_demande ON scrims (source_demande_id) WHERE source_demande_id IS NOT NULL;

-- Trigger updated_at (reutilise le helper standard si dispo, sinon inline)
CREATE OR REPLACE FUNCTION scrims_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scrims_updated_at ON scrims;
CREATE TRIGGER trg_scrims_updated_at
  BEFORE UPDATE ON scrims
  FOR EACH ROW
  EXECUTE FUNCTION scrims_set_updated_at();


/* -----------------------------------------------------------
 * 2) Ajout de scrim_id sur la table matches
 *    Un match appartient soit a un tournoi, soit a un scrim, jamais aux deux.
 * ---------------------------------------------------------*/

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS scrim_id uuid REFERENCES scrims(id) ON DELETE CASCADE;

-- tournament_id doit pouvoir etre NULL pour les matchs lies a un scrim
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'matches'
      AND column_name = 'tournament_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE matches ALTER COLUMN tournament_id DROP NOT NULL;
  END IF;
END $$;

-- Exactement un owner : tournament_id XOR scrim_id
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_owner_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_owner_check CHECK (
    (tournament_id IS NOT NULL AND scrim_id IS NULL)
    OR
    (tournament_id IS NULL AND scrim_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_matches_scrim_id
  ON matches (scrim_id)
  WHERE scrim_id IS NOT NULL;

COMMIT;
