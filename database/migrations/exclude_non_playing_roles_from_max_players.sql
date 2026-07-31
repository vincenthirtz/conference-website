-- Migration: l'encadrement ne consomme jamais de place dans le roster
-- Date: 2026-07-31
-- Description:
--   `enforce_team_max_players()` n'excluait que le rôle 'coach' du quota
--   `tournaments.max_players`. Une MANAGER consommait donc une place de
--   joueuse, alors que toute l'application la traite comme de l'encadrement :
--     - `utils/teams/roleKind.ts` : NON_PLAYING_TEAM_ROLES = coach + manager ;
--     - aucun BattleTag exigé de ces rôles (roleRequiresBattleTag) ;
--     - exclues du `min_players` à l'inscription
--       (cf. pages/api/teams/create-with-member.ts) ;
--     - affichées dans une section « staff de l'équipe », hors roster jouant.
--
--   Conséquence de la dérive : une équipe avec une manager se voyait refuser
--   une joueuse une place trop tôt, et disparaissait de la liste de
--   recrutement une place trop tôt.
--
--   Règle retenue : coach ET manager ne consomment JAMAIS de place.
--
--   Idempotent (CREATE OR REPLACE). Pour revenir en arrière, remplacer
--   `NOT IN ('coach','manager')` par `!= 'coach'` aux trois endroits.

CREATE OR REPLACE FUNCTION enforce_team_max_players()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_min_max_players INTEGER;
BEGIN
  -- Encadrement : hors quota, quoi qu'il arrive.
  IF NEW.role IN ('coach', 'manager') THEN
    RETURN NEW;
  END IF;

  -- Compter les membres JOUANTS apres l'operation.
  -- Pour un INSERT, on compte les lignes existantes + 1 (la nouvelle).
  -- Pour un UPDATE, on compte tel quel : le row existe deja. Si l'ancien
  -- role etait de l'encadrement et qu'on bascule vers un role jouant, +1.
  SELECT COUNT(*) INTO v_count
  FROM team_members
  WHERE team_id = NEW.team_id AND role NOT IN ('coach', 'manager');

  IF TG_OP = 'INSERT' THEN
    v_count := v_count + 1;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.role IN ('coach', 'manager')
        AND NEW.role NOT IN ('coach', 'manager') THEN
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

COMMENT ON FUNCTION enforce_team_max_players() IS
  'Empeche un team_members.insert/update de depasser tournaments.max_players. Coach ET manager sont hors quota (encadrement). Race-safe (verrouillage au niveau row par PG).';
