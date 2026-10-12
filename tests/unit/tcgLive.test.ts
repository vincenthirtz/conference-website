// tests/unit/tcgLive.test.ts
//
// Le TCG « en action » côté public : `utils/tcg/live.ts` et
// `GET /api/public/tcg/live`.
//
// CE QUE CES CAS PROTÈGENT.
//   1. CONSENTEMENT : un nom n'apparaît que vitrine ACTIVE dans CET espace, et
//      jamais pour une joueuse retirée du TCG ; sinon « Une joueuse » (tirage)
//      ou absence (classement). Aucun identifiant de compte, aucun horodatage.
//   2. CLASSEMENT : complétion = distinctes / vivier (le dénominateur de la
//      barre de progression), multi-tenant, tri stable.
//   3. CARTE DE LA SEMAINE : déterministe, sans redite avant d'avoir tout
//      montré, jamais une carte de joueuse.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetSupabaseMock, store } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  ageInHours,
  isoWeekLabel,
  isoWeekOf,
  pickWeeklyKey,
  rankCollectors,
  readCardOfWeek,
  readCollectorsLeaderboard,
  readRecentRarePulls,
  readPoolTotal,
} from '../../utils/tcg/live';
import { MAP_POOL_SLUGS } from '../../utils/tcg/readMapFaces';
import { GAME_MASCOT_SLUGS } from '../../utils/tcg/gameMascots';
import handler, {
  TCG_LIVE_CACHE_CONTROL,
} from '../../pages/api/public/tcg/live';

const TENANT = DEFAULT_TENANT_ID;
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const ALICE = '3d4e5f60-7182-4394-a5b6-c7d8e9f0a1b2';
const BEA = '4e5f6071-8293-44a5-b6c7-d8e9f0a1b2c3';
const CLEO = '5f607182-93a4-45b6-87d8-e9f0a1b2c3d4';
const TEAM = '60718293-a4b5-46c7-98e9-f0a1b2c3d4e5';
const TEAM2 = '718293a4-b5c6-47d8-a9f0-a1b2c3d4e5f6';

const NOW = new Date('2026-10-12T12:00:00.000Z');

function rating(userId: string, name: string, tenantId = TENANT) {
  return {
    user_id: userId,
    tenant_id: tenantId,
    display_name: name,
    battle_tag: null,
    avatar_url: null,
    rating: 1500,
  };
}

function showcase(userId: string, enabled: boolean, tenantId = TENANT) {
  return {
    tenant_id: tenantId,
    user_id: userId,
    enabled,
    subject_keys: [],
  };
}

let packs = 0;
function seedPack(
  userId: string,
  cards: Array<{ kind: 'player' | 'team' | 'map'; id: string; rarity: string }>,
  opts: { openedAt?: string | null; source?: string; tenantId?: string } = {}
) {
  packs += 1;
  const id = `cc000000-0000-4000-8000-${String(packs).padStart(12, '0')}`;
  (store.tcg_packs ||= []).push({
    id,
    tenant_id: opts.tenantId ?? TENANT,
    user_id: userId,
    source_kind: opts.source ?? 'victory',
    source_match_id: null,
    granted_at: '2026-10-01T00:00:00.000Z',
    opened_at:
      opts.openedAt === undefined ? '2026-10-12T09:30:00.000Z' : opts.openedAt,
  });
  cards.forEach((c, position) => {
    (store.tcg_pack_cards ||= []).push({
      pack_id: id,
      position,
      subject_kind: c.kind,
      card_user_id: c.kind === 'player' ? c.id : null,
      card_team_id: c.kind === 'team' ? c.id : null,
      card_map_slug: c.kind === 'map' ? c.id : null,
      card_fanart_id: null,
      card_mascot_slug: null,
      rarity: c.rarity,
      is_foil: false,
      recycled_at: null,
    });
  });
  return id;
}

function seedTeams() {
  store.teams = [
    {
      id: TEAM,
      tenant_id: TENANT,
      name: 'Hinode Sparkles',
      short_name: 'HIN',
      slug: 'hinode',
      logo_url: null,
      deleted_at: null,
      is_active: true,
    },
    {
      id: TEAM2,
      tenant_id: TENANT,
      name: 'Kitsune',
      short_name: 'KIT',
      slug: 'kitsune',
      logo_url: null,
      deleted_at: null,
      is_active: true,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  packs = 0;
  seedTeams();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------- */

describe('âge d’un tirage', () => {
  it('en heures entières, jamais négatif', () => {
    expect(ageInHours('2026-10-12T11:59:00.000Z', NOW)).toBe(0);
    expect(ageInHours('2026-10-12T09:30:00.000Z', NOW)).toBe(2);
    expect(ageInHours('2026-10-13T00:00:00.000Z', NOW)).toBe(0);
    expect(ageInHours('pas une date', NOW)).toBe(0);
  });
});

describe('derniers tirages rares — consentement', () => {
  it('nomme la vitrine active, anonymise le reste, ne sort aucun identifiant', async () => {
    store.player_ratings = [rating(ALICE, 'Alice'), rating(BEA, 'Bea')] as any;
    store.tcg_showcases = [showcase(ALICE, true), showcase(BEA, false)] as any;
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'legendary' }], {
      openedAt: '2026-10-12T09:30:00.000Z',
    });
    seedPack(BEA, [{ kind: 'map', id: MAP_POOL_SLUGS[0], rarity: 'epic' }], {
      openedAt: '2026-10-12T11:30:00.000Z',
    });

    const pulls = await readRecentRarePulls(TENANT, NOW);
    expect(pulls).toHaveLength(2);
    // Le plus récent d'abord.
    expect(pulls[0].collector).toBeNull();
    expect(pulls[0].ageHours).toBe(0);
    expect(pulls[1].collector).toBe('Alice');
    expect(pulls[1].ageHours).toBe(2);

    const json = JSON.stringify(pulls);
    expect(json).not.toContain(ALICE);
    expect(json).not.toContain(BEA);
    expect(json).not.toContain('opened_at');
    expect(json).not.toContain('2026-10-12T');
  });

  it('une vitrine active dans un AUTRE espace ne vaut pas consentement ici', async () => {
    store.player_ratings = [rating(ALICE, 'Alice')] as any;
    store.tcg_showcases = [showcase(ALICE, true, OTHER_TENANT)] as any;
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'rare' }]);
    const pulls = await readRecentRarePulls(TENANT, NOW);
    expect(pulls).toHaveLength(1);
    expect(pulls[0].collector).toBeNull();
  });

  it('une joueuse retirée du TCG reste anonyme, vitrine active ou non', async () => {
    store.player_ratings = [rating(ALICE, 'Alice')] as any;
    store.tcg_showcases = [showcase(ALICE, true)] as any;
    store.tcg_player_cards = [
      {
        tenant_id: TENANT,
        user_id: ALICE,
        photo_path: null,
        photo_status: null,
        revoked_at: null,
        excluded_at: '2026-10-01T00:00:00.000Z',
      },
    ] as any;
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'epic' }]);
    const pulls = await readRecentRarePulls(TENANT, NOW);
    expect(pulls[0].collector).toBeNull();
  });

  it('écarte les communes, les paquets fermés, les échanges et les autres espaces', async () => {
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'common' }]);
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'legendary' }], {
      openedAt: null,
    });
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'legendary' }], {
      source: 'trade',
    });
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'legendary' }], {
      tenantId: OTHER_TENANT,
    });
    expect(await readRecentRarePulls(TENANT, NOW)).toEqual([]);
  });

  it('la carte montrée garde sa rareté et sa face', async () => {
    seedPack(ALICE, [
      { kind: 'map', id: MAP_POOL_SLUGS[0], rarity: 'common' },
      { kind: 'team', id: TEAM, rarity: 'epic' },
    ]);
    const [pull] = await readRecentRarePulls(TENANT, NOW);
    expect(pull.card.kind).toBe('team');
    expect(pull.card.rarity).toBe('epic');
    expect(pull.card.kind === 'team' && pull.card.name).toBe('Hinode Sparkles');
  });
});

/* ---------------------------------------------------------------------- */

describe('classement — logique pure', () => {
  it('trie par complétion, puis cartes, puis nom ; écarte les collections vides', () => {
    const ranked = rankCollectors(
      [
        { name: 'Zoé', owned: 5 },
        { name: 'Alice', owned: 5 },
        { name: 'Bea', owned: 9 },
        { name: 'Vide', owned: 0 },
      ],
      10
    );
    expect(ranked.map((r) => r.name)).toEqual(['Bea', 'Alice', 'Zoé']);
    expect(ranked[0]).toEqual({
      rank: 1,
      name: 'Bea',
      owned: 9,
      total: 10,
      completion: 90,
    });
  });

  it('plafonne à 100 % et à la taille demandée', () => {
    const ranked = rankCollectors(
      Array.from({ length: 15 }, (_, i) => ({ name: `J${i}`, owned: 20 - i })),
      12
    );
    expect(ranked).toHaveLength(10);
    expect(ranked[0].completion).toBe(100);
  });

  it('un vivier vide ne classe personne', () => {
    expect(rankCollectors([{ name: 'A', owned: 3 }], 0)).toEqual([]);
  });
});

describe('classement — consentement et multi-tenant', () => {
  it('ne classe QUE les vitrines actives de cet espace ; les autres sont exclues, pas anonymisées', async () => {
    store.player_ratings = [
      rating(ALICE, 'Alice'),
      rating(BEA, 'Bea'),
      rating(CLEO, 'Cleo'),
    ] as any;
    store.tcg_showcases = [
      showcase(ALICE, true),
      showcase(BEA, false),
      showcase(CLEO, true, OTHER_TENANT),
    ] as any;
    seedPack(ALICE, [
      { kind: 'team', id: TEAM, rarity: 'common' },
      { kind: 'team', id: TEAM2, rarity: 'common' },
      // Doublon : compté une fois.
      { kind: 'team', id: TEAM, rarity: 'rare' },
    ]);
    seedPack(BEA, [{ kind: 'team', id: TEAM, rarity: 'common' }]);
    seedPack(CLEO, [{ kind: 'team', id: TEAM, rarity: 'common' }]);

    const total = await readPoolTotal(TENANT);
    expect(total).toBe(
      3 + 2 + MAP_POOL_SLUGS.length + GAME_MASCOT_SLUGS.length
    );

    const board = await readCollectorsLeaderboard(TENANT);
    expect(board).toHaveLength(1);
    expect(board[0].name).toBe('Alice');
    expect(board[0].owned).toBe(2);
    expect(board[0].total).toBe(total);
    expect(JSON.stringify(board)).not.toContain(ALICE);
    expect(JSON.stringify(board)).not.toMatch(/Une joueuse|null/);
  });

  it('les cartes possédées dans un autre espace ne comptent pas ici', async () => {
    store.player_ratings = [rating(ALICE, 'Alice')] as any;
    store.tcg_showcases = [showcase(ALICE, true)] as any;
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'common' }]);
    seedPack(ALICE, [{ kind: 'team', id: TEAM2, rarity: 'common' }], {
      tenantId: OTHER_TENANT,
    });
    const board = await readCollectorsLeaderboard(TENANT);
    expect(board[0].owned).toBe(1);
  });

  it('une joueuse retirée du TCG sort du classement', async () => {
    store.player_ratings = [rating(ALICE, 'Alice')] as any;
    store.tcg_showcases = [showcase(ALICE, true)] as any;
    store.tcg_player_cards = [
      {
        tenant_id: TENANT,
        user_id: ALICE,
        excluded_at: '2026-10-01T00:00:00.000Z',
      },
    ] as any;
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'common' }]);
    expect(await readCollectorsLeaderboard(TENANT)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- */

describe('carte de la semaine', () => {
  it('semaine ISO : jeudi décisif, années à 53 semaines', () => {
    expect(isoWeekOf(new Date('2026-10-12T00:00:00Z'))).toEqual({
      year: 2026,
      week: 42,
    });
    // Le 1er janvier 2027 est un vendredi : il appartient à 2026-W53.
    expect(isoWeekOf(new Date('2027-01-01T00:00:00Z'))).toEqual({
      year: 2026,
      week: 53,
    });
    expect(isoWeekOf(new Date('2027-01-04T00:00:00Z'))).toEqual({
      year: 2027,
      week: 1,
    });
    expect(isoWeekLabel({ year: 2026, week: 3 })).toBe('2026-W03');
  });

  const keys = Array.from({ length: 20 }, (_, i) => `team:t${i}`);
  const prev = (year: number, week: number) =>
    week > 1 ? { year, week: week - 1 } : { year: year - 1, week: 52 };

  it('déterministe, insensible à l’ordre de lecture', () => {
    const w = { year: 2026, week: 42 };
    const a = pickWeeklyKey(keys, w, prev(2026, 42));
    const b = pickWeeklyKey([...keys].reverse(), w, prev(2026, 42));
    expect(a).toBe(b);
    expect(keys).toContain(a);
  });

  it('aucune redite avant d’avoir montré tout le vivier', () => {
    const seen = new Set<string | null>();
    for (let week = 1; week <= 20; week += 1) {
      seen.add(pickWeeklyKey(keys, { year: 2026, week }, prev(2026, week)));
    }
    expect(seen.size).toBe(20);
  });

  it('jamais deux semaines de suite la même carte, jointure d’année comprise', () => {
    const small = ['map:a', 'map:b', 'map:c'];
    for (let year = 2020; year < 2040; year += 1) {
      const last = pickWeeklyKey(
        small,
        { year: year - 1, week: 52 },
        { year: year - 1, week: 51 }
      );
      const first = pickWeeklyKey(
        small,
        { year, week: 1 },
        { year: year - 1, week: 52 }
      );
      expect(first).not.toBe(last);
    }
  });

  it('vivier vide : rien', () => {
    expect(pickWeeklyKey([], { year: 2026, week: 1 }, prev(2026, 1))).toBe(
      null
    );
  });

  it('ne met jamais en avant une carte de joueuse', async () => {
    store.player_ratings = [rating(ALICE, 'Alice')] as any;
    for (let d = 0; d < 60; d += 1) {
      const now = new Date(Date.UTC(2026, 0, 1) + d * 7 * 86_400_000);
      const week = await readCardOfWeek(TENANT, now);
      expect(week).not.toBeNull();
      expect(week!.card.kind).not.toBe('player');
    }
  });

  it('la même semaine rend la même carte', async () => {
    const a = await readCardOfWeek(TENANT, new Date('2026-10-12T08:00:00Z'));
    const b = await readCardOfWeek(TENANT, new Date('2026-10-18T22:00:00Z'));
    expect(a?.week).toBe('2026-W42');
    expect(a?.card.key).toBe(b?.card.key);
  });
});

/* ---------------------------------------------------------------------- */

function makeReq(): any {
  return {
    method: 'GET',
    headers: { host: 'example.com', 'x-forwarded-for': '203.0.113.7' },
    query: {},
    socket: { remoteAddress: '203.0.113.7' },
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

describe('GET /api/public/tcg/live', () => {
  it('rend les trois blocs, en cache public court', async () => {
    store.player_ratings = [rating(ALICE, 'Alice')] as any;
    store.tcg_showcases = [showcase(ALICE, true)] as any;
    seedPack(ALICE, [{ kind: 'team', id: TEAM, rarity: 'epic' }]);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe(TCG_LIVE_CACHE_CONTROL);
    expect(Object.keys(res.body).sort()).toEqual([
      'cardOfWeek',
      'collectors',
      'recentPulls',
    ]);
    expect(res.body.recentPulls[0].collector).toBe('Alice');
    expect(res.body.collectors[0].name).toBe('Alice');
    expect(JSON.stringify(res.body)).not.toContain(ALICE);
  });

  it('refuse les autres méthodes', async () => {
    const res = makeRes();
    await handler({ ...makeReq(), method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Cache-Control']).toBeUndefined();
  });
});
