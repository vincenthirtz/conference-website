-- Migration: roster lock par tournoi
-- Date: 2026-04-28
--
-- Ajoute une colonne roster_locked_at sur tournaments pour interdire toute
-- modification du roster (ajout/suppression/swap de membres) des equipes
-- inscrites a partir d'une certaine date.
--
-- Comportement attendu :
--   - roster_locked_at = NULL  -> roster libre (defaut)
--   - roster_locked_at <= now() -> roster verrouille pour toutes les teams
--     inscrites a ce tournoi (utils/teams/rosterLock.ts s'en charge)
--   - roster_locked_at > now() -> deadline future, encore libre
--
-- L'API admin (manager+) peut toujours forcer une modification via un flag
-- explicite dans la requete (force=true), pour gerer les cas exceptionnels
-- (transferts, blessure, etc.).

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS roster_locked_at timestamptz;

COMMENT ON COLUMN tournaments.roster_locked_at IS
  'Date a partir de laquelle le roster des equipes inscrites est verrouille (NULL = pas de verrouillage). Les modifications de team_members sont rejetees si la date est passee.';

-- Index utile pour la requete "tournois actifs avec roster verrouille"
-- (utilise par le helper isTeamRosterLocked).
CREATE INDEX IF NOT EXISTS tournaments_roster_locked_idx
  ON tournaments (roster_locked_at)
  WHERE roster_locked_at IS NOT NULL;
