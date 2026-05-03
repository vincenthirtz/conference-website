-- Migration: Trigger PG pour appliquer max_players de facon atomique
-- Date: 2026-05-03
-- Description:
--   Ferme la race condition de pages/api/teams/add-member.ts (et update-member-role)
--   ou deux requetes concurrentes pouvaient toutes deux passer le pre-check
--   "currentCount >= max_players" puis inserer simultanement, depassant la limite.
--
--   Strategie : trigger BEFORE INSERT OR UPDATE OF role sur team_members
--   qui :
--     - ignore les coachs (exclus de la limite)
--     - calcule le total non-coach apres l'operation
--     - rejette si ce total depasse la plus petite max_players parmi les
--       tournois auxquels la team est inscrite
--
--   La defense-in-depth cote TS reste en place pour donner un message d'erreur
--   propre quand le pre-check est deja en mesure de detecter le probleme.

CREATE OR REPLACE FUNCTION enforce_team_max_players()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_min_max_players INTEGER;
BEGIN
  -- Si la cible est un coach, pas de limite a verifier (les coachs ne
  -- comptent pas dans le quota de joueuses).
  IF NEW.role = 'coach' THEN
    RETURN NEW;
  END IF;

  -- Compter les membres non-coach apres l'operation.
  -- Pour un INSERT, on compte les lignes existantes + 1 (la nouvelle).
  -- Pour un UPDATE, on compte tel quel : le row existe deja. Si l'ancien
  -- role etait 'coach' et qu'on bascule vers non-coach, +1.
  SELECT COUNT(*) INTO v_count
  FROM team_members
  WHERE team_id = NEW.team_id AND role != 'coach';

  IF TG_OP = 'INSERT' THEN
    v_count := v_count + 1;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'coach' AND NEW.role != 'coach' THEN
    v_count := v_count + 1;
  END IF;

  -- Plus petite max_players des tournois actifs auxquels la team est inscrite.
  SELECT MIN(t.max_players) INTO v_min_max_players
  FROM tournament_teams tt
  INNER JOIN tournaments t ON t.id = tt.tournament_id
  WHERE tt.team_id = NEW.team_id AND t.max_players IS NOT NULL;

  IF v_min_max_players IS NOT NULL AND v_count > v_min_max_players THEN
    RAISE EXCEPTION
      'team % exceeds tournament max_players limit (% > %)',
      NEW.team_id, v_count, v_min_max_players
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_members_enforce_max_players ON team_members;
CREATE TRIGGER team_members_enforce_max_players
BEFORE INSERT OR UPDATE OF role ON team_members
FOR EACH ROW
EXECUTE FUNCTION enforce_team_max_players();

COMMENT ON FUNCTION enforce_team_max_players() IS
  'Empeche un team_members.insert/update de depasser tournaments.max_players. Race-safe (verrouillage au niveau row par PG).';
