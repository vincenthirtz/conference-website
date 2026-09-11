// tests/unit/oauthReturn.test.ts
//
// Le retour d'un parcours OAuth doit se lire : sans ça, une reconnexion
// Instagram ratée ramenait sur l'admin sans un mot (2026-09-11).

import { describe, it, expect } from 'vitest';
import {
  readOauthReturn,
  withoutOauthParams,
} from '../../utils/social/oauthReturn';

describe('readOauthReturn', () => {
  it('lit un échec Instagram et sa raison', () => {
    expect(
      readOauthReturn({
        tab: 'social',
        instagram: 'error',
        reason: 'bad_state',
      })
    ).toEqual({
      platform: 'instagram',
      outcome: 'error',
      reason: 'bad_state',
      handle: null,
    });
  });

  it('lit un succès TikTok et son compte', () => {
    expect(
      readOauthReturn({
        tab: 'social',
        tiktok: 'connected',
        handle: 'Women’s Cup',
      })
    ).toEqual({
      platform: 'tiktok',
      outcome: 'connected',
      reason: null,
      handle: 'Women’s Cup',
    });
  });

  it('ignore une query sans retour, ou une valeur inconnue', () => {
    expect(readOauthReturn({ tab: 'social' })).toBeNull();
    expect(readOauthReturn({ instagram: 'pouet' })).toBeNull();
    expect(readOauthReturn({ instagram: '' })).toBeNull();
  });

  it('prend la première valeur d’un paramètre répété', () => {
    expect(
      readOauthReturn({ instagram: ['cancelled', 'error'] })?.outcome
    ).toBe('cancelled');
  });
});

describe('withoutOauthParams', () => {
  it('retire les paramètres OAuth et garde l’onglet', () => {
    expect(
      withoutOauthParams({
        tab: 'social',
        instagram: 'error',
        reason: 'exchange_failed',
        handle: 'x',
        tiktok: 'connected',
      })
    ).toEqual({ tab: 'social' });
  });

  it('garde les autres paramètres, tableaux compris', () => {
    expect(withoutOauthParams({ tab: 'social', ids: ['a', 'b'] })).toEqual({
      tab: 'social',
      ids: ['a', 'b'],
    });
  });
});
