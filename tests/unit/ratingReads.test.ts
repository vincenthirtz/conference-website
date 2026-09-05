// tests/unit/ratingReads.test.ts
//
// Unit tests for the shared rating read utils after the R3 perf change:
//   - readLeaderboard : DB-paginated page (.range) instead of loading the
//     whole player_ratings table then slicing in JS. rank = offset + i + 1.
//   - readPlayerProfile : rank computed by COUNT queries (no row transfer),
//     faithful to the tie-break (rating desc, user_id asc), with the legacy
//     "non-rated player → lastRank + 1" behavior preserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { readLeaderboard } from '../../utils/rating/readLeaderboard';
import { readPlayerProfile } from '../../utils/rating/readPlayerProfile';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function pr(over: Record<string, unknown>): Record<string, unknown> {
  return {
    tenant_id: TENANT,
    user_id: 'u',
    rating: 1500,
    rd: 60,
    volatility: 0.06,
    peak_rating: 1500,
    games_played: 5,
    wins: 3,
    losses: 2,
    display_name: null,
    battle_tag: null,
    avatar_url: null,
    ...over,
  };
}

beforeEach(() => resetSupabaseMock());

describe('readLeaderboard (DB-paginated)', () => {
  it('returns the first page ordered by rating desc with global ranks', async () => {
    store.player_ratings = [
      pr({ user_id: 'u2', rating: 1500 }),
      pr({ user_id: 'u1', rating: 1600 }),
      pr({ user_id: 'u3', rating: 1400 }),
    ];
    const { players } = await readLeaderboard(TENANT, 50, 0);
    expect(players.map((p) => p.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(players.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it('breaks rating ties by user_id asc', async () => {
    store.player_ratings = [
      pr({ user_id: 'ub', rating: 1500 }),
      pr({ user_id: 'ua', rating: 1500 }),
    ];
    const { players } = await readLeaderboard(TENANT, 50, 0);
    expect(players.map((p) => p.userId)).toEqual(['ua', 'ub']);
    expect(players.map((p) => p.rank)).toEqual([1, 2]);
  });

  it('excludes unrated players (games_played = 0)', async () => {
    store.player_ratings = [
      pr({ user_id: 'u1', rating: 1600, games_played: 4 }),
      pr({ user_id: 'u2', rating: 1900, games_played: 0 }),
    ];
    const { players } = await readLeaderboard(TENANT, 50, 0);
    expect(players.map((p) => p.userId)).toEqual(['u1']);
  });

  it('honors DB pagination via .range and keeps ranks offset-based', async () => {
    // 5 rated players; ask for page 2 (limit 2, offset 2). The mock slices the
    // filtered set after filtering, so range() drives what comes back.
    store.player_ratings = [
      pr({ user_id: 'u1', rating: 1600 }),
      pr({ user_id: 'u2', rating: 1500 }),
      pr({ user_id: 'u3', rating: 1400 }),
      pr({ user_id: 'u4', rating: 1300 }),
      pr({ user_id: 'u5', rating: 1200 }),
    ];
    const { players } = await readLeaderboard(TENANT, 2, 2);
    expect(players).toHaveLength(2);
    expect(players.map((p) => p.userId)).toEqual(['u3', 'u4']);
    expect(players.map((p) => p.rank)).toEqual([3, 4]);
  });

  it('maps the full player shape', async () => {
    store.player_ratings = [
      pr({
        user_id: 'u1',
        rating: 1600,
        rd: 55,
        games_played: 10,
        wins: 7,
        losses: 3,
        display_name: 'Top',
        battle_tag: 'Top#1',
        avatar_url: 'http://x/a.png',
      }),
    ];
    const { players } = await readLeaderboard(TENANT, 50, 0);
    expect(players[0]).toEqual({
      userId: 'u1',
      displayName: 'Top',
      // Le classement est une surface PUBLIQUE : le BattleTag en sort masqué
      // (« Top#1 » -> « Top »), comme partout ailleurs en public
      // (cf. utils/battleTag.ts et tests/unit/publicBattleTagPrivacy.test.ts).
      battleTag: 'Top',
      avatarUrl: 'http://x/a.png',
      // Repli d'avatar : la joueuse n'a pas d'équipe dans ce fixture, donc
      // aucun logo à substituer (cf. utils/teams/readPlayerTeamBadges.ts).
      teamName: null,
      teamSlug: null,
      teamLogoUrl: null,
      rating: 1600,
      rd: 55,
      gamesPlayed: 10,
      wins: 7,
      losses: 3,
      rank: 1,
    });
  });
});

describe('readPlayerProfile rank (COUNT-based)', () => {
  it('returns rank 1 for the top rated player', async () => {
    store.player_ratings = [
      pr({ user_id: 'top', rating: 1700 }),
      pr({ user_id: 'mid', rating: 1500 }),
      pr({ user_id: 'low', rating: 1300 }),
    ];
    const res = await readPlayerProfile('top', TENANT);
    expect(res?.player.rank).toBe(1);
  });

  it('counts strictly-higher-rated players', async () => {
    store.player_ratings = [
      pr({ user_id: 'a', rating: 1700 }),
      pr({ user_id: 'b', rating: 1600 }),
      pr({ user_id: 'target', rating: 1500 }),
    ];
    const res = await readPlayerProfile('target', TENANT);
    expect(res?.player.rank).toBe(3);
  });

  it('applies the user_id asc tie-break on equal ratings', async () => {
    store.player_ratings = [
      pr({ user_id: 'aaa', rating: 1500 }),
      pr({ user_id: 'bbb', rating: 1500 }),
      pr({ user_id: 'ccc', rating: 1500 }),
    ];
    // aaa < bbb < ccc → ranks 1,2,3
    expect((await readPlayerProfile('aaa', TENANT))?.player.rank).toBe(1);
    expect((await readPlayerProfile('bbb', TENANT))?.player.rank).toBe(2);
    expect((await readPlayerProfile('ccc', TENANT))?.player.rank).toBe(3);
  });

  it('traite comme ex æquo deux ratings que la troncature float sépare', async () => {
    // PostgREST rend les float8 à 15 chiffres significatifs : deux joueuses
    // réellement ex æquo peuvent revenir avec des valeurs qui diffèrent au
    // 16e chiffre. Sans tolérance, l'une comptait l'autre comme « au-dessus »
    // et tout le groupe d'ex æquo glissait d'un cran (la 1re s'affichait 6e).
    store.player_ratings = [
      pr({ user_id: 'aaa', rating: 1822.26037147842 }),
      pr({ user_id: 'bbb', rating: 1822.2603714784216 }),
    ];
    expect((await readPlayerProfile('aaa', TENANT))?.player.rank).toBe(1);
    expect((await readPlayerProfile('bbb', TENANT))?.player.rank).toBe(2);
  });

  it('ignores unrated players when counting higher/tie', async () => {
    store.player_ratings = [
      pr({ user_id: 'unrated', rating: 1900, games_played: 0 }),
      pr({ user_id: 'target', rating: 1500, games_played: 5 }),
    ];
    // The 1900 unrated player must not push target down.
    const res = await readPlayerProfile('target', TENANT);
    expect(res?.player.rank).toBe(1);
  });

  it('ranks a non-rated player just after the last rated one', async () => {
    store.player_ratings = [
      pr({ user_id: 'r1', rating: 1600, games_played: 4 }),
      pr({ user_id: 'r2', rating: 1500, games_played: 3 }),
      pr({ user_id: 'me', rating: 1550, games_played: 0 }),
    ];
    // 2 rated players → non-rated `me` gets rank 3 (lastRank + 1),
    // regardless of its own (unranked) rating.
    const res = await readPlayerProfile('me', TENANT);
    expect(res?.player.rank).toBe(3);
  });

  it('returns null for an unknown player', async () => {
    store.player_ratings = [pr({ user_id: 'r1', rating: 1600 })];
    expect(await readPlayerProfile('nope', TENANT)).toBeNull();
  });
});

// Une joueuse sans ligne `player_ratings` renvoyait `null`, donc un 404 sur sa
// fiche publique — c'était le cas de 61 joueuses sur 69, alors que la page
// d'équipe et les feuilles de match lient TOUS les membres d'un roster. Le
// classement n'est qu'une partie de la fiche ; son absence ne doit pas emporter
// le nom, l'avatar ni la chaîne Twitch.
describe('readPlayerProfile — joueuse non classée', () => {
  function member(over: Record<string, unknown>): Record<string, unknown> {
    return {
      tenant_id: TENANT,
      team_id: 't1',
      user_id: 'u-sans-match',
      display_name: null,
      battle_tag: null,
      avatar_url: null,
      twitch: null,
      created_at: '2026-01-01T00:00:00.000Z',
      ...over,
    };
  }

  it('rend une fiche depuis le roster quand il n’y a aucun rating', async () => {
    store.player_ratings = [];
    store.team_members = [
      member({ display_name: 'Nova', battle_tag: 'Nova#1234' }),
    ];

    const res = await readPlayerProfile('u-sans-match', TENANT);

    expect(res).not.toBeNull();
    expect(res?.player.displayName).toBe('Nova');
    expect(res?.player.unrated).toBe(true);
  });

  it('n’invente ni rang ni classement', async () => {
    store.player_ratings = [];
    store.team_members = [member({ display_name: 'Nova' })];

    const res = await readPlayerProfile('u-sans-match', TENANT);

    // `rank: 0` la ferait passer pour première, `rank: n+1` pour dernière.
    // Elle n'est ni l'une ni l'autre : elle ne figure pas au classement.
    expect(res?.player.rank).toBeNull();
    expect(res?.player.gamesPlayed).toBe(0);
  });

  it('ne masque pas le BattleTag derrière son identifiant numérique', async () => {
    store.player_ratings = [];
    store.team_members = [member({ battle_tag: 'Nova#1234' })];

    const res = await readPlayerProfile('u-sans-match', TENANT);

    // Fiche PUBLIQUE : même règle que pour une joueuse classée.
    expect(res?.player.battleTag).not.toContain('1234');
  });

  it('renvoie des sections vides plutôt que des données d’une autre', async () => {
    store.player_ratings = [];
    store.team_members = [member({ display_name: 'Nova' })];

    const res = await readPlayerProfile('u-sans-match', TENANT);

    expect(res?.history).toEqual([]);
    expect(res?.recentMatches).toEqual([]);
    expect(res?.h2h).toEqual([]);
    expect(res?.achievements.badges).toEqual([]);
    expect(res?.achievements.palmares).toEqual([]);
  });

  it('404 pour un UUID qui n’est sur aucun roster', async () => {
    // Être sur un roster est ce qui rend une fiche légitime : sans ça, un UUID
    // au hasard fabriquerait une page.
    store.player_ratings = [];
    store.team_members = [member({ user_id: 'quelquun-dautre' })];

    expect(await readPlayerProfile('u-sans-match', TENANT)).toBeNull();
  });

  it('ne pioche pas dans le roster d’un AUTRE tenant', async () => {
    store.player_ratings = [];
    store.team_members = [member({ tenant_id: 'un-autre-tenant' })];

    expect(await readPlayerProfile('u-sans-match', TENANT)).toBeNull();
  });

  it('une joueuse classée reste marquée comme telle', async () => {
    store.player_ratings = [pr({ user_id: 'r1', rating: 1600 })];
    store.team_members = [];

    const res = await readPlayerProfile('r1', TENANT);

    expect(res?.player.unrated).toBe(false);
    expect(res?.player.rank).toBe(1);
  });
});
