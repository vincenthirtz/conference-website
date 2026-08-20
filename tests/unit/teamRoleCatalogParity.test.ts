// « Quels rôles d'équipe existent ? » — une question, une réponse.
//
// La liste `player | coach | substitute | manager` était recopiée à la main à
// QUATRE endroits en TypeScript (validateRole, update-member-role,
// invitations, DEFAULT_TEAM_ROLES) et une cinquième fois en SQL
// (`chk_team_members_role`). Aucune ne cassait si les autres bougeaient, et
// les modes de défaillance sont muets :
//
//   - un rôle présent en TS mais pas dans la CHECK → l'INSERT échoue en 23514,
//     traduit en « Échec de l'ajout du membre » ;
//   - un rôle présent dans la CHECK mais pas en TS → `validateRole` le rabat
//     silencieusement sur `player`, ce qui a réellement eu lieu (le wizard
//     envoyait `sub` au lieu de `substitute` : la remplaçante était
//     enregistrée titulaire).
//
// Les quatre déclarations TS sont désormais une seule (`TEAM_ROLE_VALUES`).
// Ce test tient la cinquième, qui vit en SQL et qu'aucun type ne peut
// atteindre : il lit la migration.
//
// Cibles : utils/teamRoles.ts, database/migrations/enforce_status_check_constraints.sql

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  TEAM_ROLE_VALUES,
  DEFAULT_TEAM_ROLES,
  isTeamRoleValue,
} from '../../utils/teamRoles';
import { validateRole } from '../../utils/apiHelpers';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CHECK_MIGRATION = path.join(
  REPO_ROOT,
  'database',
  'migrations',
  'enforce_status_check_constraints.sql'
);

/** Les valeurs listées par la CHECK `chk_team_members_role`, lues dans le SQL. */
function rolesFromSqlCheck(): string[] {
  const sql = fs.readFileSync(CHECK_MIGRATION, 'utf8');
  const m =
    /chk_team_members_role\s+CHECK\s*\(\s*role\s+IN\s*\(([^)]*)\)/i.exec(sql);
  if (!m) throw new Error('CHECK chk_team_members_role introuvable');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('parité TypeScript ↔ contrainte SQL', () => {
  it('la CHECK liste exactement TEAM_ROLE_VALUES', () => {
    expect(new Set(rolesFromSqlCheck())).toEqual(new Set(TEAM_ROLE_VALUES));
  });

  it('le catalogue de permissions par défaut couvre tous les rôles', () => {
    // `DEFAULT_TEAM_ROLES` sert de repli quand `site_settings.team_roles` est
    // absent (c'est le cas en prod). Un rôle qui n'y figure pas n'aurait
    // AUCUNE permission — silencieusement.
    expect(new Set(DEFAULT_TEAM_ROLES.map((r) => r.value))).toEqual(
      new Set(TEAM_ROLE_VALUES)
    );
  });
});

describe('validateRole s’aligne sur la même liste', () => {
  it('laisse passer chaque rôle connu', () => {
    for (const role of TEAM_ROLE_VALUES) {
      expect(validateRole(role)).toBe(role);
    }
  });

  it('rabat un rôle inconnu sur `player`', () => {
    // Le repli est volontaire (une entrée douteuse ne doit pas créer un rôle
    // arbitraire) mais SILENCIEUX : c'est ce qui a laissé `sub` passer pour un
    // rôle valide côté wizard pendant des mois.
    expect(validateRole('sub')).toBe('player');
    expect(validateRole('analyst')).toBe('player');
    expect(validateRole('')).toBe('player');
  });

  it('normalise la casse et les espaces', () => {
    expect(validateRole('  Manager ')).toBe('manager');
  });
});

describe('isTeamRoleValue', () => {
  it('reconnaît les rôles connus et rejette le reste', () => {
    expect(isTeamRoleValue('coach')).toBe(true);
    expect(isTeamRoleValue('captain')).toBe(false); // le capitanat vit dans teams.captain_id
    expect(isTeamRoleValue(null)).toBe(false);
  });
});
