// utils/teams/clientPermissions.ts — lecture CLIENT des permissions d'équipe.
//
// Ce helper porte une décision qui ne se voit pas dans un écran : le REPLI
// quand l'API ne renvoie pas le champ (client déployé avant le serveur, payload
// en cache). Se tromper de repli, c'est soit masquer des boutons à une
// capitaine, soit ré-ouvrir à un coach ce que le serveur lui refuse — deux
// régressions silencieuses. D'où des tests sur le repli lui-même, pas seulement
// sur le cas nominal.

import { describe, it, expect } from 'vitest';
import {
  makeTeamPermissionCheck,
  readTeamPermissions,
} from '../../utils/teams/clientPermissions';
import { TEAM_PERMISSION_VALUES } from '../../utils/teamRoles';

describe('readTeamPermissions', () => {
  it('rend la liste du serveur, filtrée et dans l’ordre canonique', () => {
    const perms = readTeamPermissions({
      permissions: ['validate_lineup', 'manage_scrims', 'inventée'],
      isCaptain: false,
      isManager: true,
    });
    expect(perms).toEqual(['manage_scrims', 'validate_lineup']);
  });

  it('un tableau VIDE est une réponse, pas une absence : aucune permission', () => {
    expect(
      readTeamPermissions({
        permissions: [],
        isCaptain: false,
        isManager: true,
      })
    ).toEqual([]);
  });

  it('champ absent + droits de gestion → repli sur le comportement d’avant', () => {
    // Sans ce repli, un déploiement client en avance masquerait tout l'écran de
    // gestion à une capitaine.
    expect(readTeamPermissions({ isCaptain: true })).toEqual(
      TEAM_PERMISSION_VALUES
    );
    expect(readTeamPermissions({ isManager: true })).toEqual(
      TEAM_PERMISSION_VALUES
    );
  });

  it('champ absent et aucun droit de gestion → rien', () => {
    expect(readTeamPermissions({ isCaptain: false, isManager: false })).toEqual(
      []
    );
    expect(readTeamPermissions(null)).toEqual([]);
  });
});

describe('makeTeamPermissionCheck', () => {
  it('répond sur la liste fournie', () => {
    const can = makeTeamPermissionCheck(['manage_scrims']);
    expect(can('manage_scrims')).toBe(true);
    expect(can('manage_roster')).toBe(false);
  });

  it('readOnly (inspection staff) refuse TOUT geste', () => {
    const canDo = makeTeamPermissionCheck([...TEAM_PERMISSION_VALUES], {
      readOnly: true,
    });
    for (const p of TEAM_PERMISSION_VALUES) expect(canDo(p)).toBe(false);
  });
});
