// tests/unit/playerBadgesParity.test.ts
//
// Vague 4c — optimisation PURE de la lecture de profil et de l'ouverture de
// paquet. Aucun résultat ne doit bouger :
//
//   1. PARITÉ DU PROFIL. `readPlayerProfile` parallélise désormais ses branches
//      indépendantes. Il doit rendre, au champ près, ce que rendait la version
//      séquentielle — gardée en copie figée dans
//      `__helpers__/readPlayerProfileLegacy.ts`.
//   2. PARITÉ DES BADGES. `readPlayerBadges` remplace, pour la rareté des
//      cartes, un `readPlayerProfile` par carte. Une rareté différente serait un
//      bug d'économie visible des joueuses : ses badges doivent être ceux de
//      l'ancienne lecture, joueuse par joueuse, y compris sur panne partielle.
//   3. NOMBRE DE LECTURES. Ouvrir un paquet de 5 joueuses ne doit pas coûter
//      plus de lectures qu'un paquet de 1, ni aucun appel GoTrue.
//
// Le jeu de données couvre délibérément les cas limites qui décident d'un
// badge : remplaçante (ne compte pas), ligue brouillon ou privée (ne compte
// pas), classement d'un autre espace (ne compte pas), match inconnu ou sans
// tournoi, compte supprimé, joueuse non classée, joueuse absente.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

// Sans maps, un vivier de joueuses seules donne un paquet 100 % joueuses : le
// test de comptage mesure alors exactement ce qu'il prétend mesurer.
vi.mock('@/utils/tcg/readMapFaces', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, MAP_POOL_SLUGS: [] };
});

import {
  store,
  resetSupabaseMock,
  setAdminUser,
  setAuthUser,
  fromCalls,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { readPlayerProfile } from '../../utils/rating/readPlayerProfile';
import { readPlayerBadges } from '../../utils/rating/readPlayerBadges';
import { readPlayerProfile as legacyReadPlayerProfile } from './__helpers__/readPlayerProfileLegacy';
import { REMOVED_PLAYER_NAME } from '../../utils/player/personalDataTables';
import { cardRarity } from '../../utils/tcg/rarity';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import handler from '../../pages/api/player/tcg/packs';

const T = DEFAULT_TENANT_ID;
const OTHER = '99999999-9999-4999-8999-999999999999';

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'; // championne, reine de saison, maîtresse
const B = 'aaaaaaaa-0000-4000-8000-00000000000b'; // finaliste, remplaçante chez les championnes
const C = 'aaaaaaaa-0000-4000-8000-00000000000c'; // ligne sans match (games_played = 0)
const D = 'aaaaaaaa-0000-4000-8000-00000000000d'; // compte supprimé, ex-championne
const E = 'aaaaaaaa-0000-4000-8000-00000000000e'; // sur un roster, jamais classée
const F = 'aaaaaaaa-0000-4000-8000-00000000000f'; // inconnue
const G = 'aaaaaaaa-0000-4000-8000-000000000001'; // top 8, scrim, match inconnu
const H = 'aaaaaaaa-0000-4000-8000-000000000002'; // classée dans un AUTRE espace
const I = 'aaaaaaaa-0000-4000-8000-000000000003'; // élite sans tournoi ni équipe

const ALL = [A, B, C, D, E, F, G, H, I];

const TX = 'team-x';
const TY = 'team-y';
const TZ = 'team-z';

function rating(user: string, over: Record<string, unknown> = {}) {
  return {
    id: `pr-${user}`,
    tenant_id: T,
    user_id: user,
    rating: 1500,
    rd: 60,
    volatility: 0.06,
    peak_rating: 1500,
    games_played: 5,
    wins: 3,
    losses: 2,
    display_name: `Joueuse ${user.slice(-1)}`,
    battle_tag: `J${user.slice(-1)}#1234`,
    avatar_url: null,
    ...over,
  };
}

let seq = 0;
/**
 * Identifiant qui NE suit PAS l'ordre d'insertion : la lecture groupée pagine
 * par `id`, l'ancienne lisait dans l'ordre naturel. Une parité obtenue parce
 * que les deux ordres coïncident ne prouverait rien.
 */
const rid = (p: string) => `${p}-${String(1000 - ++seq).padStart(4, '0')}`;

function hist(user: string, match: string, day: number, result: string) {
  return {
    id: rid('h'),
    tenant_id: T,
    user_id: user,
    match_id: match,
    tournament_id: null,
    occurred_at: `2026-03-${String(day).padStart(2, '0')}T20:00:00Z`,
    rating_before: 1500,
    rating_after: 1510,
    result,
    opponent_avg_rating: 1500,
  };
}

function part(user: string, match: string, team: string, sub = false) {
  return {
    id: rid('mp'),
    tenant_id: T,
    user_id: user,
    match_id: match,
    team_id: team,
    battle_tag: `P#${user.slice(-1)}`,
    is_substitute: sub,
  };
}

function seedRich() {
  seq = 0;
  store.player_ratings = [
    rating(A, {
      rating: 1990,
      peak_rating: 2050,
      games_played: 120,
      wins: 90,
      losses: 30,
    }),
    rating(B, {
      rating: 1640,
      peak_rating: 1650,
      games_played: 12,
      wins: 11,
      losses: 1,
    }),
    rating(C, { games_played: 0, wins: 0, losses: 0, peak_rating: 1500 }),
    rating(D, {
      display_name: REMOVED_PLAYER_NAME,
      battle_tag: null,
      avatar_url: null,
      peak_rating: 2100,
      games_played: 200,
    }),
    rating(G, { rating: 1580, peak_rating: 1610, games_played: 55 }),
    {
      ...rating(H, { peak_rating: 2400, games_played: 300 }),
      tenant_id: OTHER,
    },
    rating(I, { rating: 1850, peak_rating: 1850, games_played: 9 }),
  ] as any;

  store.team_members = [
    {
      tenant_id: T,
      user_id: E,
      display_name: 'Recrue',
      battle_tag: 'Recrue#1',
      avatar_url: null,
      created_at: '2026-01-01',
      twitch: null,
    },
    {
      tenant_id: T,
      user_id: B,
      display_name: 'B',
      battle_tag: null,
      avatar_url: null,
      created_at: '2026-01-01',
      twitch: 'b_stream',
    },
  ] as any;
  setAdminUser(A, 'a@example.test', { user_metadata: { twitch: 'a_live' } });

  store.matches = [
    {
      id: 'm1',
      tenant_id: T,
      tournament_id: 't1',
      team1_id: TX,
      team2_id: TY,
      winner_team_id: TX,
      completed_at: '2026-03-01T21:00:00Z',
    },
    {
      id: 'm2',
      tenant_id: T,
      tournament_id: 't1',
      team1_id: TX,
      team2_id: TY,
      winner_team_id: TX,
      completed_at: '2026-03-02T21:00:00Z',
    },
    {
      id: 'm3',
      tenant_id: T,
      tournament_id: 't2',
      team1_id: TX,
      team2_id: TZ,
      winner_team_id: TX,
      completed_at: '2026-03-03T21:00:00Z',
    },
    // Scrim : pas de tournoi, donc pas de paire de palmarès.
    {
      id: 'm4',
      tenant_id: T,
      tournament_id: null,
      team1_id: TZ,
      team2_id: TY,
      winner_team_id: null,
      completed_at: '2026-03-04T21:00:00Z',
    },
    {
      id: 'm5',
      tenant_id: T,
      tournament_id: 't3',
      team1_id: TZ,
      team2_id: TY,
      winner_team_id: TY,
      completed_at: '2026-03-05T21:00:00Z',
    },
  ] as any;

  store.match_participants = [
    part(A, 'm1', TX),
    part(A, 'm2', TX),
    part(A, 'm3', TX),
    part(B, 'm1', TY),
    part(B, 'm2', TY),
    // Remplaçante chez les championnes de t2 : ne doit RIEN lui rapporter.
    part(B, 'm3', TX, true),
    part(D, 'm1', TX),
    part(G, 'm3', TZ),
    part(G, 'm4', TZ),
    part(G, 'm5', TZ),
    // Match absent de `matches` : participation sans paire.
    part(G, 'ghost', TZ),
  ] as any;

  const days = (user: string, results: string[], match = 'm1') =>
    results.map((r, i) => hist(user, `${match}-${i}`, i + 1, r));
  store.player_rating_history = [
    ...days(A, ['win', 'win', 'win', 'win', 'win', 'win', 'loss', 'win']),
    // Onze victoires d'affilée, insérées dans le DÉSORDRE chronologique.
    ...days(B, [
      'win',
      'win',
      'win',
      'win',
      'win',
      'win',
      'win',
      'win',
      'win',
      'win',
      'win',
      'loss',
    ]).reverse(),
    ...days(D, ['win', 'win', 'win', 'win', 'win']),
    ...days(G, ['win', 'loss', 'win', 'win', 'win', 'win']),
    // Chronologiquement W W W L W W W : série de 3, AUCUN badge. Insérée (et
    // donc identifiée) dans un ordre où les six victoires se suivent — une
    // série de 6 apparaîtrait si le tri par date sautait. L'inversion ne
    // suffit pas à le prouver : la plus longue série est la même à l'envers.
    ...[
      [1, 'win'],
      [2, 'win'],
      [3, 'win'],
      [5, 'win'],
      [6, 'win'],
      [7, 'win'],
      [4, 'loss'],
    ].map(([day, r]) => hist(I, `mi-${day}`, day as number, r as string)),
    { ...hist(H, 'mh', 1, 'win'), tenant_id: OTHER },
  ] as any;

  store.final_rankings = [
    { id: rid('fr'), tenant_id: T, tournament_id: 't1', team_id: TX, rank: 1 },
    { id: rid('fr'), tenant_id: T, tournament_id: 't1', team_id: TY, rank: 2 },
    { id: rid('fr'), tenant_id: T, tournament_id: 't2', team_id: TX, rank: 1 },
    { id: rid('fr'), tenant_id: T, tournament_id: 't2', team_id: TZ, rank: 7 },
    { id: rid('fr'), tenant_id: T, tournament_id: 't3', team_id: TZ, rank: 12 },
    // Un autre espace classe TZ premier de t2 : ne doit pas compter.
    {
      id: rid('fr'),
      tenant_id: OTHER,
      tournament_id: 't2',
      team_id: TZ,
      rank: 1,
    },
  ] as any;

  store.tournaments = [
    {
      id: 't1',
      tenant_id: T,
      name: 'Coupe 1',
      slug: 'c1',
      start_date: '2026-03-01',
      end_date: null,
    },
    {
      id: 't2',
      tenant_id: T,
      name: 'Coupe 2',
      slug: 'c2',
      start_date: null,
      end_date: '2026-03-03',
    },
  ] as any;
  store.teams = [
    { id: TX, tenant_id: T, name: 'X' },
    { id: TY, tenant_id: T, name: 'Y' },
    { id: TZ, tenant_id: T, name: 'Z' },
  ] as any;

  store.leagues = [
    {
      id: 'L1',
      tenant_id: T,
      name: 'Saison 1',
      slug: 's1',
      is_public: true,
      status: 'active',
    },
    {
      id: 'L2',
      tenant_id: T,
      name: 'Brouillon',
      slug: 's2',
      is_public: true,
      status: 'draft',
    },
    {
      id: 'L3',
      tenant_id: T,
      name: 'Privée',
      slug: 's3',
      is_public: false,
      status: 'active',
    },
  ] as any;
  store.league_standings = [
    {
      id: rid('ls'),
      tenant_id: T,
      league_id: 'L1',
      team_id: TX,
      rank: 1,
      points: 30,
    },
    {
      id: rid('ls'),
      tenant_id: T,
      league_id: 'L1',
      team_id: TY,
      rank: 2,
      points: 20,
    },
    {
      id: rid('ls'),
      tenant_id: T,
      league_id: 'L2',
      team_id: TZ,
      rank: 1,
      points: 40,
    },
    {
      id: rid('ls'),
      tenant_id: T,
      league_id: 'L3',
      team_id: TZ,
      rank: 1,
      points: 40,
    },
    {
      id: rid('ls'),
      tenant_id: T,
      league_id: 'L1',
      team_id: TZ,
      rank: null,
      points: null,
    },
  ] as any;
}

/** Badges selon l'ANCIENNE voie de la rareté : un profil par joueuse. */
async function legacyBadges(userId: string) {
  try {
    const profile = await legacyReadPlayerProfile(userId, T);
    return profile?.achievements.badges ?? [];
  } catch {
    return null; // l'ancienne voie retombait alors sur `common`
  }
}

/**
 * Fait échouer toute lecture d'une table : la chaîne rend `{ data: null,
 * error }`, comme PostgREST sur une panne.
 */
function failTable(table: string) {
  const original = supabaseAdmin.from;
  return vi.spyOn(supabaseAdmin, 'from').mockImplementation(((t: string) => {
    if (t !== table) return original(t);
    fromCalls.push(t);
    const failing: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) =>
              resolve({ data: null, error: { message: 'boom' }, count: null });
          }
          return () => failing;
        },
      }
    );
    return failing;
  }) as any);
}

beforeEach(() => {
  resetSupabaseMock();
  seedRich();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readPlayerProfile — parité avec la version séquentielle', () => {
  it('rend exactement le même profil pour chaque joueuse du jeu de données', async () => {
    for (const id of ALL) {
      const before = await legacyReadPlayerProfile(id, T);
      const after = await readPlayerProfile(id, T);
      expect(after, `profil ${id}`).toStrictEqual(before);
    }
  });

  it('le jeu de données n’est pas vacant : il produit des fiches, des null et des badges variés', async () => {
    const a = await readPlayerProfile(A, T);
    expect(a?.achievements.badges.map((b) => b.key)).toEqual(
      expect.arrayContaining([
        'champion',
        'league_winner',
        'peak_master',
        'veteran_legend',
        'win_streak',
      ])
    );
    expect(a?.h2h.length).toBeGreaterThan(0);
    expect(a?.recentMatches.length).toBe(3);
    expect(a?.player.twitch).toBe('a_live');
    expect(await readPlayerProfile(D, T)).toBeNull();
    expect(await readPlayerProfile(F, T)).toBeNull();
    expect((await readPlayerProfile(E, T))?.player.unrated).toBe(true);
  });

  it.each([
    'player_rating_history',
    'match_participants',
    'matches',
    'final_rankings',
    'tournaments',
    'teams',
    'league_standings',
    'leagues',
    'team_members',
  ])('même profil quand « %s » est illisible', async (table) => {
    failTable(table);
    for (const id of ALL) {
      const before = await legacyReadPlayerProfile(id, T).catch(
        (e: Error) => `throw:${e.message}`
      );
      const after = await readPlayerProfile(id, T).catch(
        (e: Error) => `throw:${e.message}`
      );
      expect(after, `profil ${id}`).toStrictEqual(before);
    }
  });

  it('une erreur de rang fait toujours tomber la fiche, avec la même erreur', async () => {
    failTable('player_ratings');
    await expect(readPlayerProfile(A, T)).rejects.toThrow(
      'Failed to load player'
    );
    await expect(legacyReadPlayerProfile(A, T)).rejects.toThrow(
      'Failed to load player'
    );
  });
});

describe('readPlayerBadges — parité avec un profil par joueuse', () => {
  it('rend, joueuse par joueuse, les badges de l’ancienne lecture', async () => {
    const batch = await readPlayerBadges(T, ALL);
    expect([...batch.keys()].sort()).toEqual([...ALL].sort());
    for (const id of ALL) {
      expect(batch.get(id), `badges ${id}`).toStrictEqual(
        await legacyBadges(id)
      );
    }
  });

  it('couvre les quatre raretés (sinon la parité ne prouverait rien)', async () => {
    const batch = await readPlayerBadges(T, ALL);
    const rarities = new Set(ALL.map((id) => cardRarity(batch.get(id) ?? [])));
    expect(rarities).toEqual(new Set(['legendary', 'epic', 'rare', 'common']));
    // Les cas qui ne doivent rien valoir : supprimée, inconnue, autre espace.
    expect(batch.get(D)).toEqual([]);
    expect(batch.get(F)).toEqual([]);
    expect(batch.get(H)).toEqual([]);
    // La remplaçante ne récupère pas le titre de t2.
    expect(batch.get(B)?.map((b) => b.key)).not.toContain('champion');
  });

  it('ne dépend pas de la composition de la demande (seule ou en groupe)', async () => {
    const batch = await readPlayerBadges(T, ALL);
    for (const id of ALL) {
      const alone = await readPlayerBadges(T, [id]);
      expect(alone.get(id), `badges ${id}`).toStrictEqual(batch.get(id));
    }
  });

  it.each([
    'player_rating_history',
    'match_participants',
    'matches',
    'final_rankings',
    'league_standings',
    'leagues',
  ])(
    'mêmes badges quand « %s » est illisible (panne joueuse par joueuse)',
    async (table) => {
      failTable(table);
      const batch = await readPlayerBadges(T, ALL);
      for (const id of ALL) {
        expect(batch.get(id), `badges ${id}`).toStrictEqual(
          await legacyBadges(id)
        );
      }
    }
  );

  it('player_ratings illisible : LÈVE, comme le profil (l’appelant retombe sur common)', async () => {
    failTable('player_ratings');
    await expect(readPlayerBadges(T, [A])).rejects.toThrow();
    expect(await legacyBadges(A)).toBeNull();
  });

  it('pagine au-delà de 1000 lignes sans en perdre', async () => {
    // 1 200 lignes d'historique : une lecture non paginée s'arrêterait à 1 000
    // sur PostgREST. Ici le mock ne tronque pas, c'est la PAGINATION qu'on
    // vérifie — les deux pages doivent être lues et recollées.
    store.player_rating_history = Array.from({ length: 1200 }, (_, i) =>
      hist(I, `mi-${i}`, 1, i === 1199 ? 'loss' : 'win')
    ).map((h, i) => ({
      ...h,
      occurred_at: `2026-03-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    })) as any;
    const batch = await readPlayerBadges(T, [I]);
    const streak = batch.get(I)?.find((b) => b.key === 'win_streak');
    expect(streak?.description).toBe("1199 victoires d'affilée.");
    expect(fromCalls.filter((t) => t === 'player_rating_history')).toHaveLength(
      2
    );
  });
});

describe('nombre de lectures', () => {
  function countersAround() {
    fromCalls.length = 0;
    const gotrue = vi.spyOn(supabaseAdmin.auth.admin, 'getUserById');
    return () => ({ from: fromCalls.length, gotrue: gotrue.mock.calls.length });
  }

  it('readPlayerBadges : borné, identique pour 1 et pour 5 joueuses, sans GoTrue', async () => {
    const one = countersAround();
    await readPlayerBadges(T, [A]);
    const forOne = one();
    vi.restoreAllMocks();

    const five = countersAround();
    await readPlayerBadges(T, [A, B, G, I, C]);
    const forFive = five();
    vi.restoreAllMocks();

    const legacy = countersAround();
    for (const id of [A, B, G, I, C]) await legacyReadPlayerProfile(id, T);
    const forLegacy = legacy();

    expect(forOne.from).toBeLessThanOrEqual(7);
    expect(forFive.from).toBe(forOne.from);
    expect(forFive.gotrue).toBe(0);
    // Mesuré le 2026-09-16 sur ce jeu : 7 lectures et 0 GoTrue en groupe,
    // contre 58 lectures et 5 GoTrue pour l'ancienne voie (un profil par carte).
    expect(forLegacy.from).toBeGreaterThan(forFive.from * 5);
  });

  const PACK = '22222222-2222-4222-8222-222222222222';
  const OPENER = '11111111-1111-4111-8111-111111111111';

  async function openPackWithPool(playerIds: string[]) {
    store.player_ratings = (store.player_ratings as any[]).filter(
      (r) => r.tenant_id !== T || playerIds.includes(r.user_id)
    ) as any;
    // Vivier sans équipe active ni fan art : le paquet n'est fait que de joueuses.
    store.teams = [] as any;
    store.tcg_packs = [
      {
        id: PACK,
        tenant_id: T,
        user_id: OPENER,
        source_kind: 'match_win',
        granted_at: '2026-01-01T00:00:00.000Z',
        opened_at: null,
      },
    ] as any;
    setAuthUser({ id: OPENER });
    const res: any = { statusCode: 200, headers: {} };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    res.setHeader = (k: string, v: unknown) => {
      res.headers[k] = v;
    };
    const count = countersAround();
    await handler(
      {
        method: 'POST',
        headers: { host: 'h', authorization: `Bearer t-${Math.random()}` },
        cookies: {},
        query: {},
        body: { packId: PACK },
      } as any,
      res
    );
    return { res, ...count() };
  }

  it('ouvrir un paquet de 5 joueuses coûte autant de lectures qu’un paquet de 1, et aucun GoTrue', async () => {
    const single = await openPackWithPool([A]);
    expect(single.res.statusCode).toBe(200);
    expect(single.res.body.cards).toHaveLength(1);
    vi.restoreAllMocks();

    resetSupabaseMock();
    seedRich();
    const full = await openPackWithPool([A, B, C, G, I]);
    expect(full.res.statusCode).toBe(200);
    const kinds = full.res.body.cards.map((c: { kind: string }) => c.kind);
    expect(kinds).toEqual(['player', 'player', 'player', 'player', 'player']);

    expect(full.from).toBe(single.from);
    expect(full.gotrue).toBe(0);
  });

  it('la rareté des cartes tirées est celle de l’ancienne voie', async () => {
    const opened = await openPackWithPool([A, B, C, G, I]);
    expect(opened.res.statusCode).toBe(200);
    for (const card of opened.res.body.cards as Array<{
      userId: string;
      rarity: string;
    }>) {
      const legacy = await legacyBadges(card.userId);
      expect(card.rarity, `carte ${card.userId}`).toBe(
        cardRarity(legacy ?? [])
      );
    }
    expect(
      new Set(opened.res.body.cards.map((c: { rarity: string }) => c.rarity))
    ).toEqual(new Set(['legendary', 'epic', 'rare', 'common']));
  });
});
