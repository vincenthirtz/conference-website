// utils/teams/memberDisplayName — repli de pseudo pour les lignes team_members.
//
// `team_members.display_name` est une surcharge par équipe presque toujours
// nulle : le pseudo vit sur le compte. Les joueuses s'en sortaient via leur
// BattleTag ; l'encadrement, qui n'en a pas l'obligation, s'affichait vide.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  resetSupabaseMock,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';
import {
  resolveMissingDisplayNames,
  withFallbackDisplayName,
} from '../../utils/teams/memberDisplayName';

beforeEach(() => {
  resetSupabaseMock();
});

describe('resolveMissingDisplayNames', () => {
  it('ne résout que les lignes sans display_name', async () => {
    setRpcResult('admin_get_user_profiles', {
      data: [{ id: 'u-coach', display_name: 'Coach Nyo' }],
    });

    const resolved = await resolveMissingDisplayNames([
      { user_id: 'u-player', display_name: 'Déjà nommée' },
      { user_id: 'u-coach', display_name: null },
    ]);

    expect(resolved.get('u-coach')).toBe('Coach Nyo');
    expect(resolved.has('u-player')).toBe(false);

    const call = rpcCalls.find((c) => c.fn === 'admin_get_user_profiles');
    expect((call?.params as any)?.p_ids).toEqual(['u-coach']);
  });

  it('n’appelle pas le RPC quand tout le monde a déjà un pseudo', async () => {
    const resolved = await resolveMissingDisplayNames([
      { user_id: 'u1', display_name: 'A' },
      { user_id: 'u2', display_name: 'B' },
    ]);

    expect(resolved.size).toBe(0);
    expect(rpcCalls.some((c) => c.fn === 'admin_get_user_profiles')).toBe(false);
  });

  it('ignore les lignes sans user_id', async () => {
    const resolved = await resolveMissingDisplayNames([
      { user_id: null, display_name: null },
    ]);
    expect(resolved.size).toBe(0);
    expect(rpcCalls.some((c) => c.fn === 'admin_get_user_profiles')).toBe(false);
  });
});

describe('withFallbackDisplayName', () => {
  const resolved = new Map<string, string | null>([['u-coach', 'Coach Nyo']]);

  it('le pseudo du roster prime', () => {
    expect(
      withFallbackDisplayName(
        { user_id: 'u-coach', display_name: 'Surcharge' },
        resolved
      )
    ).toBe('Surcharge');
  });

  it('retombe sur le pseudo du compte', () => {
    expect(
      withFallbackDisplayName({ user_id: 'u-coach', display_name: null }, resolved)
    ).toBe('Coach Nyo');
  });

  it('renvoie null quand rien n’est connu', () => {
    expect(
      withFallbackDisplayName({ user_id: 'u-inconnue', display_name: null }, resolved)
    ).toBeNull();
    expect(
      withFallbackDisplayName({ user_id: null, display_name: null }, resolved)
    ).toBeNull();
  });
});
