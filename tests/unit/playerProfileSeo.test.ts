// tests/unit/playerProfileSeo.test.ts
//
// LA règle de vie privée de la fiche publique : une joueuse n'est indexée par
// les moteurs que si ELLE a activé sa découverte. Sans preuve de cet opt-in,
// `noindex`. Extraite de pages/player/[userId].tsx pour être verrouillée ici.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  buildPlayerSeo,
  coreLabel,
  readProfileDiscoverable,
} from '../../utils/rating/playerProfileSeo';
import type { PlayerProfileResponse } from '../../types/rating';

const USER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const profile: PlayerProfileResponse = {
  player: {
    userId: USER,
    displayName: 'Camille',
    battleTag: 'Camille#••••',
    avatarUrl: null,
    twitch: null,
    unrated: false,
    rating: 1612.4,
    rd: 60,
    volatility: 0.06,
    peakRating: 1650,
    gamesPlayed: 4,
    wins: 3,
    losses: 1,
    rank: 2,
  },
  history: [],
  recentMatches: [],
  h2h: [],
  achievements: { badges: [], palmares: [], seasons: [] },
};

async function seoFor(): Promise<ReturnType<typeof buildPlayerSeo>> {
  return buildPlayerSeo(profile, await readProfileDiscoverable(USER));
}

beforeEach(() => {
  resetSupabaseMock();
  store.player_discovery_profiles = [];
});

describe('indexation de la fiche publique', () => {
  it('pas de ligne player_discovery_profiles ⇒ noindex: true', async () => {
    expect((await seoFor()).noindex).toBe(true);
  });

  it('discoverable: false ⇒ noindex: true', async () => {
    store.player_discovery_profiles = [
      { auth_user_id: USER, discoverable: false },
    ] as any;
    expect((await seoFor()).noindex).toBe(true);
  });

  it('discoverable: true ⇒ indexable', async () => {
    store.player_discovery_profiles = [
      { auth_user_id: USER, discoverable: true },
    ] as any;
    expect((await seoFor()).noindex).toBe(false);
  });

  it('l’opt-in d’une AUTRE joueuse n’indexe pas celle-ci', async () => {
    store.player_discovery_profiles = [
      { auth_user_id: 'autre', discoverable: true },
    ] as any;
    expect((await seoFor()).noindex).toBe(true);
  });
});

describe('contenu SEO (comportement inchangé par l’extraction)', () => {
  it('titre et libellé', () => {
    const seo = buildPlayerSeo(profile, false);
    expect(coreLabel(profile.player)).toBe('Camille');
    expect(seo.title).toEqual({
      fr: 'Profil de Camille — 1612',
      en: "Camille's profile — 1612",
    });
  });

  it('joueuse non classée : pas de zéro affiché comme une mesure', () => {
    const seo = buildPlayerSeo(
      { ...profile, player: { ...profile.player, unrated: true } },
      false
    );
    expect(seo.title).toEqual({
      fr: 'Profil de Camille',
      en: "Camille's profile",
    });
  });
});
