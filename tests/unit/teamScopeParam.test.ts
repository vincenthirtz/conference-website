// utils/teamScopeParam — le format de fil du contrat `?teamId=`.
//
// Il traverse ~30 routes de gestion : c'est lui qui dit au serveur SUR QUELLE
// équipe un manager multi-équipes agit. Un paramètre mal collé (séparateur
// oublié, valeur non encodée) et l'action part sur l'équipe par défaut, en
// silence — l'écran affichant l'autre.

import { describe, it, expect } from 'vitest';
import {
  TEAM_SCOPE_QUERY_PARAM,
  withTeamParam,
} from '../../utils/teamScopeParam';

describe('withTeamParam', () => {
  it('ajoute le paramètre sur une URL nue', () => {
    expect(withTeamParam('/api/teams/join-requests', 'abc')).toBe(
      '/api/teams/join-requests?teamId=abc'
    );
  });

  it('enchaîne avec un query string existant', () => {
    expect(
      withTeamParam('/api/teams/join-requests?status=pending', 'abc')
    ).toBe('/api/teams/join-requests?status=pending&teamId=abc');
  });

  it('se compose avec `?as=` sans casser la première clé', () => {
    expect(withTeamParam('/api/player/dashboard?as=u1&act=1', 't1')).toBe(
      '/api/player/dashboard?as=u1&act=1&teamId=t1'
    );
  });

  it('encode la valeur', () => {
    expect(withTeamParam('/api/x', 'a b&c')).toBe('/api/x?teamId=a%20b%26c');
  });

  it('no-op sans équipe active — le cas de tout le monde', () => {
    // C'est ce qui garantit que le comportement mono-équipe est INCHANGÉ :
    // l'URL doit être identique, pas seulement équivalente.
    expect(withTeamParam('/api/teams/leave', null)).toBe('/api/teams/leave');
    expect(withTeamParam('/api/teams/leave', undefined)).toBe(
      '/api/teams/leave'
    );
    expect(withTeamParam('/api/teams/leave', '')).toBe('/api/teams/leave');
  });

  it('la clé est bien celle que le serveur lit', () => {
    expect(TEAM_SCOPE_QUERY_PARAM).toBe('teamId');
  });
});
