// tests/unit/apiBotPlayersBattleTags.test.ts
//
// GET /api/bot/v1/players/battle-tags — correspondance discordUserId →
// BattleTag de tout le tenant, pour le scan blacklist du bot (remplace un
// appel `.../by-discord/:id/team` par membre). Contrat vérifié :
//   - auth (clé), méthode, validation de la query ;
//   - forme minimale ({ discordUserId, battleTag } seulement), tri, exclusions ;
//   - battleTag identique au `member.battleTag` de `.../team` ;
//   - isolation entre tenants ;
//   - pagination par curseur ;
//   - instantané illisible → 503 BATTLE_TAGS_UNAVAILABLE.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetSupabaseMock,
  seedBotAuth,
  BOT_TEST_API_KEY,
  CONFERENCE_TENANT_ID,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { __resetBotImpersonationCachesForTests } from '../../utils/botAuth';
import { __resetBotPlanCacheForTests } from '../../utils/billing/botPlanGate';
import { __resetPlayerTeamSnapshotForTests } from '../../utils/botPlayerTeamSnapshot';
import handler from '../../pages/api/bot/v1/players/battle-tags';
import teamHandler from '../../pages/api/bot/v1/players/by-discord/[discordUserId]/team';

const TEAM = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const OTHER_TENANT = '99999999-8888-4777-8666-555555555555';
const OTHER_KEY = 'other-tenant-key';
const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const D = (n: number) => `10000000000000000${n}`;

let ip = 0;
function req(
  query: Record<string, string> = {},
  over: { method?: string; apiKey?: string | null } = {}
): any {
  ip += 1;
  const headers: Record<string, string> = {
    host: 'h',
    // IP distincte : le test ne mesure pas le limiteur de la route.
    'x-nf-client-connection-ip': `10.1.${Math.floor(ip / 250)}.${ip % 250}`,
  };
  const key = over.apiKey === undefined ? BOT_TEST_API_KEY : over.apiKey;
  if (key) headers['x-api-key'] = key;
  return { method: over.method ?? 'GET', headers, query, body: {} };
}

function res(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}

async function call(
  query: Record<string, string> = {},
  over: { method?: string; apiKey?: string | null } = {}
) {
  const r = res();
  await handler(req(query, over), r);
  return { status: r.statusCode, body: r.body as any, headers: r.headers };
}

function member(
  id: string,
  userId: string,
  battleTag: string | null,
  over: Record<string, unknown> = {}
) {
  return {
    id,
    user_id: userId,
    team_id: TEAM,
    tenant_id: CONFERENCE_TENANT_ID,
    role: 'player',
    battle_tag: battleTag,
    is_substitute: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function team(id: string, tenantId: string) {
  return {
    id,
    tenant_id: tenantId,
    name: `Team ${id.slice(-1)}`,
    slug: `team-${id.slice(-1)}`,
    short_name: null,
    logo_url: null,
    banner_url: null,
    country: 'FR',
    captain_id: null,
    is_joinable: true,
    discord: null,
    discord_role_id: null,
    description: null,
    website: null,
  };
}

function seed() {
  seedBotAuth();
  seedBotAuth({ tenantId: OTHER_TENANT, apiKey: OTHER_KEY });
  store.teams = [
    team(TEAM, CONFERENCE_TENANT_ID),
    team(TEAM_2, CONFERENCE_TENANT_ID),
    team('bbbbbbbb-0000-4000-8000-000000000009', OTHER_TENANT),
  ];
  store.team_members = [
    member('m3', U(3), 'Trois#3'),
    member('m1', U(1), 'Un#1'),
    member('m2', U(2), 'Deux#2'),
    // Membre sans BattleTag : absent de la liste.
    member('m5', U(5), null),
    // Manager multi-équipes : l'appartenance exclusive (player, plus récente)
    // l'emporte sur la manager (plus ancienne) — comme `.../team`.
    member('m6a', U(6), 'Manager#6', {
      role: 'manager',
      created_at: '2025-01-01T00:00:00Z',
    }),
    member('m6b', U(6), 'Joueuse#6', { team_id: TEAM_2 }),
    // Même compte dans un AUTRE tenant : ne doit jamais remonter ici.
    member('mx', U(2), 'Ailleurs#9', {
      team_id: 'bbbbbbbb-0000-4000-8000-000000000009',
      tenant_id: OTHER_TENANT,
    }),
    // Compte membre uniquement de l'autre tenant.
    member('my', U(7), 'Seulement#7', {
      team_id: 'bbbbbbbb-0000-4000-8000-000000000009',
      tenant_id: OTHER_TENANT,
    }),
  ];
  store.user_discord_links = [
    { auth_user_id: U(3), discord_user_id: D(3), discord_username: 'trois' },
    { auth_user_id: U(1), discord_user_id: D(1), discord_username: 'un' },
    { auth_user_id: U(2), discord_user_id: D(2), discord_username: 'deux' },
    // Lié, sans équipe.
    { auth_user_id: U(4), discord_user_id: D(4), discord_username: 'quatre' },
    { auth_user_id: U(5), discord_user_id: D(5), discord_username: 'cinq' },
    { auth_user_id: U(6), discord_user_id: D(6), discord_username: 'six' },
    { auth_user_id: U(7), discord_user_id: D(7), discord_username: 'sept' },
  ];
  // U(8) : membre d'équipe sans lien Discord → absent.
  (store.team_members as any[]).push(member('m8', U(8), 'NonLie#8'));
}

function resetAll() {
  resetSupabaseMock();
  __resetBotImpersonationCachesForTests();
  __resetBotPlanCacheForTests();
  __resetPlayerTeamSnapshotForTests();
  seed();
}

beforeEach(() => resetAll());
afterEach(() => vi.restoreAllMocks());

const EXPECTED = [
  { discordUserId: D(1), battleTag: 'Un#1' },
  { discordUserId: D(2), battleTag: 'Deux#2' },
  { discordUserId: D(3), battleTag: 'Trois#3' },
  { discordUserId: D(6), battleTag: 'Joueuse#6' },
];

describe('GET /api/bot/v1/players/battle-tags — auth & validation', () => {
  it('401 sans clé', async () => {
    expect((await call({}, { apiKey: null })).status).toBe(401);
  });

  it('401 avec une clé inconnue', async () => {
    expect((await call({}, { apiKey: 'nope' })).status).toBe(401);
  });

  it('405 + Allow sur une autre méthode', async () => {
    const r = await call({}, { method: 'POST' });
    expect(r.status).toBe(405);
    expect(String(r.headers.Allow)).toContain('GET');
  });

  it.each([
    [{ cursor: 'abc' }],
    [{ cursor: '123' }],
    [{ limit: '0' }],
    [{ limit: '-1' }],
    [{ limit: 'x' }],
    [{ limit: '10000' }],
  ])('400 INVALID_QUERY pour %o', async (q) => {
    const r = await call(q);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('INVALID_QUERY');
  });
});

describe('GET /api/bot/v1/players/battle-tags — contenu', () => {
  it('forme minimale, triée, exclusions (non lié, sans équipe, sans tag)', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: EXPECTED, nextCursor: null });
    for (const item of r.body.items) {
      expect(Object.keys(item).sort()).toEqual(['battleTag', 'discordUserId']);
    }
  });

  it('battleTag identique au member.battleTag de .../team', async () => {
    const { body } = await call();
    const byId = new Map<string, string>(
      body.items.map((i: any) => [i.discordUserId, i.battleTag])
    );
    for (const n of [1, 2, 3, 4, 5, 6, 7, 9]) {
      __resetPlayerTeamSnapshotForTests(); // chemin direct de .../team
      const r = res();
      await teamHandler(
        {
          ...req(),
          query: { discordUserId: D(n) },
        },
        r
      );
      const viaTeam =
        r.statusCode === 200 ? (r.body.member?.battleTag ?? null) : null;
      expect(byId.get(D(n)) ?? null).toBe(viaTeam);
    }
  });

  it('isolation : chaque clé ne voit que son tenant', async () => {
    const other = await call({}, { apiKey: OTHER_KEY });
    expect(other.status).toBe(200);
    expect(other.body.items).toEqual([
      { discordUserId: D(2), battleTag: 'Ailleurs#9' },
      { discordUserId: D(7), battleTag: 'Seulement#7' },
    ]);
    const mine = await call();
    const tags = mine.body.items.map((i: any) => i.battleTag);
    expect(tags).not.toContain('Ailleurs#9');
    expect(tags).not.toContain('Seulement#7');
  });
});

describe('GET /api/bot/v1/players/battle-tags — pagination', () => {
  it('parcourt toutes les pages via nextCursor', async () => {
    const seen: unknown[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const q: Record<string, string> = { limit: '3' };
      if (cursor) q.cursor = cursor;
      const r = await call(q);
      expect(r.status).toBe(200);
      expect(r.body.items.length).toBeLessThanOrEqual(3);
      seen.push(...r.body.items);
      cursor = r.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(2);
    expect(seen).toEqual(EXPECTED);
  });

  it('page pleine exacte : nextCursor null', async () => {
    const r = await call({ limit: '4' });
    expect(r.body.items).toHaveLength(4);
    expect(r.body.nextCursor).toBeNull();
  });

  it('curseur au-delà du dernier : page vide', async () => {
    const r = await call({ cursor: D(9) });
    expect(r.body).toEqual({ items: [], nextCursor: null });
  });

  it('les pages d’un parcours partagent un seul instantané', async () => {
    const from = vi.spyOn(supabaseAdmin as any, 'from');
    await call({ limit: '1' });
    await call({ limit: '1', cursor: D(1) });
    await call({ limit: '1', cursor: D(2) });
    const linkReads = from.mock.calls.filter(
      (c) => c[0] === 'user_discord_links'
    ).length;
    expect(linkReads).toBe(1);
  });
});

describe('GET /api/bot/v1/players/battle-tags — panne', () => {
  it('instantané illisible → 503 BATTLE_TAGS_UNAVAILABLE + Retry-After', async () => {
    const realFrom = (supabaseAdmin as any).from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin as any, 'from').mockImplementation(
      (...args: unknown[]) => {
        const qb = realFrom(...args);
        qb.range = () =>
          Promise.resolve({ data: null, error: { message: 'x' } });
        return qb;
      }
    );
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('BATTLE_TAGS_UNAVAILABLE');
    expect(r.headers['Retry-After']).toBe('60');
  });
});
