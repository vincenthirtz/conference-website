// tests/unit/playerProfilePrivacy.test.ts
//
// Deux règles de vie privée de la lecture du profil public
// (utils/rating/readPlayerProfile.ts) :
//
//   1. Un compte SUPPRIMÉ ne garde pas de fiche. La suppression anonymise la
//      ligne `player_ratings` (elle reste pour les classements des autres) ;
//      `/player/<uuid>` servait pourtant encore courbe, matchs et face-à-face
//      sous « Joueuse retirée ». La lecture rend désormais `null` → 404.
//   2. La chaîne Twitch publiée et SON ORIGINE (joueuse / capitaine) : le
//      formulaire de la joueuse doit voir la même valeur que la fiche.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAdminUser,
} from './__helpers__/supabaseMock';
import {
  isAnonymisedRating,
  readPlayerProfile,
  readPlayerTwitchSource,
  resolvePlayerTwitch,
} from '../../utils/rating/readPlayerProfile';
import {
  PERSONAL_DATA_TABLES,
  REMOVED_PLAYER_NAME,
} from '../../utils/player/personalDataTables';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const USER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function ratingRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    tenant_id: TENANT,
    user_id: USER,
    rating: 1600,
    rd: 60,
    volatility: 0.06,
    peak_rating: 1650,
    games_played: 4,
    wins: 3,
    losses: 1,
    display_name: 'Camille',
    battle_tag: 'Camille#1234',
    avatar_url: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  store.player_ratings = [];
  store.player_rating_history = [];
  store.match_participants = [];
  store.team_members = [];
});

describe('isAnonymisedRating', () => {
  it('reconnaît exactement ce qu’écrit la suppression de compte (lu dans le registre)', () => {
    const entry = PERSONAL_DATA_TABLES.find(
      (t) => t.table === 'player_ratings'
    );
    expect(entry?.policy.kind).toBe('anonymise');
    const set = (entry?.policy as { set: Record<string, string | null> }).set;
    expect(isAnonymisedRating({ ...set })).toBe(true);
  });

  it('ne masque pas une joueuse réelle qui partagerait seulement le libellé', () => {
    expect(
      isAnonymisedRating({
        display_name: REMOVED_PLAYER_NAME,
        battle_tag: 'Vraie#9999',
        avatar_url: null,
      })
    ).toBe(false);
    expect(
      isAnonymisedRating({
        display_name: 'Camille',
        battle_tag: null,
        avatar_url: null,
      })
    ).toBe(false);
  });
});

describe('readPlayerProfile — compte supprimé', () => {
  it('rend null pour une ligne anonymisée (→ 404), même avec historique', async () => {
    store.player_ratings = [
      ratingRow({
        display_name: REMOVED_PLAYER_NAME,
        battle_tag: null,
        avatar_url: null,
      }),
    ] as any;
    store.player_rating_history = [
      {
        tenant_id: TENANT,
        user_id: USER,
        match_id: 'm1',
        tournament_id: null,
        occurred_at: '2026-09-01T00:00:00Z',
        rating_before: 1500,
        rating_after: 1600,
        result: 'win',
        opponent_avg_rating: 1500,
      },
    ] as any;

    await expect(readPlayerProfile(USER, TENANT)).resolves.toBeNull();
  });

  it('sert toujours la fiche d’une joueuse active', async () => {
    store.player_ratings = [ratingRow({})] as any;
    const profile = await readPlayerProfile(USER, TENANT);
    expect(profile?.player.displayName).toBe('Camille');
  });
});

describe('chaîne Twitch publiée et origine', () => {
  it('resolvePlayerTwitch : la déclaration de la joueuse gagne, le roster sert de repli', () => {
    expect(resolvePlayerTwitch('  a_moi ', ['capitaine'])).toEqual({
      value: 'a_moi',
      origin: 'self',
    });
    expect(resolvePlayerTwitch('', [null, ' capitaine '])).toEqual({
      value: 'capitaine',
      origin: 'roster',
    });
    expect(resolvePlayerTwitch(undefined, [null, ''])).toBeNull();
  });

  it('readPlayerTwitchSource expose l’origine roster quand seule la capitaine l’a saisie', async () => {
    store.team_members = [
      { tenant_id: TENANT, user_id: USER, twitch: 'saisie_capitaine' },
    ] as any;
    await expect(
      readPlayerTwitchSource(USER, TENANT, undefined)
    ).resolves.toEqual({ value: 'saisie_capitaine', origin: 'roster' });
  });

  it('la fiche publique publie la même valeur que celle montrée à la joueuse', async () => {
    store.player_ratings = [ratingRow({})] as any;
    store.team_members = [
      { tenant_id: TENANT, user_id: USER, twitch: 'saisie_capitaine' },
    ] as any;
    setAdminUser(USER, 'camille@example.com', { user_metadata: {} });

    const profile = await readPlayerProfile(USER, TENANT);
    const source = await readPlayerTwitchSource(USER, TENANT, undefined);
    expect(profile?.player.twitch).toBe(source?.value);
  });
});
