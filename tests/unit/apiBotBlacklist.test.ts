// tests/unit/apiBotBlacklist.test.ts
//
// Feature Blacklist joueurs — Lot 3 (endpoint bot, withBotRoute + x-api-key).
// Ref: pages/api/bot/v1/moderation/blacklist.ts.
//
//   - GET  → ne renvoie que les entrées active=true du tenant, shape camelCase
//            { blacklist: [{ id, battleTag, displayName, discordUserId, reason }] }.
//   - POST → acteur Discord NON-staff (player/inconnu) → 403 (requireBotStaff) ;
//            acteur staff (admin/owner) → 201 crée l'entrée.
//   - DELETE → soft-disable (active=false) par { id }, { battleTag } ou
//            { discordUserId } (les 3 chemins).
//   - DELETE idempotent : rejouer ne double pas l'effet (l'entrée reste
//            désactivée, pas de seconde mutation).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/moderation/blacklist';

const STAFF_DISCORD = '900000000000000001';
const STAFF_USER_ID = 'user-staff-1';
const STAFF_ID = 'staff-1';
const PLAYER_DISCORD = '900000000000000002';
const PLAYER_USER_ID = 'user-player-1';

const ENTRY_ACTIVE = '22222222-2222-4222-8222-2222222222aa';
const ENTRY_INACTIVE = '22222222-2222-4222-8222-2222222222bb';
const ENTRY_OTHER_TENANT = '22222222-2222-4222-8222-2222222222cc';
const OTHER_TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

function seedActors() {
  store.user_discord_links = [
    { discord_user_id: STAFF_DISCORD, auth_user_id: STAFF_USER_ID },
    { discord_user_id: PLAYER_DISCORD, auth_user_id: PLAYER_USER_ID },
  ] as any;
  store.staff = [
    { id: STAFF_ID, auth_user_id: STAFF_USER_ID, role: 'admin' },
  ] as any;
}

function seedEntries() {
  store.player_blacklist = [
    {
      id: ENTRY_ACTIVE,
      tenant_id: CONFERENCE_TENANT_ID,
      battle_tag: 'alpha#1',
      display_name: 'AlphaGuy',
      discord_user_id: '111111111111111111',
      reason: 'smurf',
      notes: null,
      banned_by: null,
      active: true,
      created_at: '2026-05-01T00:00:00.000Z',
    },
    {
      id: ENTRY_INACTIVE,
      tenant_id: CONFERENCE_TENANT_ID,
      battle_tag: 'beta#2',
      display_name: 'BetaGuy',
      discord_user_id: null,
      reason: null,
      notes: null,
      banned_by: null,
      active: false,
      created_at: '2026-05-02T00:00:00.000Z',
    },
    {
      id: ENTRY_OTHER_TENANT,
      tenant_id: OTHER_TENANT,
      battle_tag: 'gamma#3',
      display_name: 'GammaGuy',
      discord_user_id: null,
      reason: null,
      notes: null,
      banned_by: null,
      active: true,
      created_at: '2026-05-03T00:00:00.000Z',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;
  seedActors();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * Auth
 * =========================================================================*/

describe('bot blacklist auth', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });
});

/* ===========================================================================
 * GET
 * =========================================================================*/

describe('GET /api/bot/v1/moderation/blacklist', () => {
  it('200 ne renvoie que les entrées active=true du tenant, shape camelCase', async () => {
    seedEntries();
    const res = makeRes();
    await handler(makeReq({}, 'GET'), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(Array.isArray(body.blacklist)).toBe(true);
    // Seule l'entrée active du tenant courant.
    expect(body.blacklist).toHaveLength(1);
    const entry = body.blacklist[0];
    expect(entry).toEqual({
      id: ENTRY_ACTIVE,
      battleTag: 'alpha#1',
      displayName: 'AlphaGuy',
      discordUserId: '111111111111111111',
      reason: 'smurf',
    });
    // Pas de fuite de champs snake_case.
    expect(entry).not.toHaveProperty('battle_tag');
  });

  it('200 liste vide si aucune entrée active', async () => {
    store.player_blacklist = [] as any;
    const res = makeRes();
    await handler(makeReq({}, 'GET'), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).blacklist).toEqual([]);
  });

  it('sans withAlerted : pas de champ alertedDiscordUserIds (rétrocompatible)', async () => {
    seedEntries();
    store.blacklist_alerts = [
      {
        id: 'al-1',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: '111111111111111111',
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq({}, 'GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body as any).not.toHaveProperty('alertedDiscordUserIds');
  });

  it('?withAlerted=1 : joint les discord_user_id déjà signalés (distinct, scope tenant)', async () => {
    seedEntries();
    store.blacklist_alerts = [
      // Deux alertes pour le même membre → dédoublonnées.
      {
        id: 'al-1',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: '111111111111111111',
      },
      {
        id: 'al-2',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: '111111111111111111',
      },
      {
        id: 'al-3',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: '222222222222222222',
      },
      // discord_user_id null → exclu.
      {
        id: 'al-4',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: null,
      },
      // Autre tenant → exclu.
      {
        id: 'al-5',
        tenant_id: OTHER_TENANT,
        discord_user_id: '333333333333333333',
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq({ query: { withAlerted: '1' } }, 'GET'), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(Array.isArray(body.blacklist)).toBe(true);
    const ids = [...(body.alertedDiscordUserIds as string[])].sort();
    expect(ids).toEqual(['111111111111111111', '222222222222222222']);
  });

  it('?withAlerted=1 sans alerte → tableau vide (pas null)', async () => {
    seedEntries();
    store.blacklist_alerts = [] as any;
    const res = makeRes();
    await handler(makeReq({ query: { withAlerted: '1' } }, 'GET'), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).alertedDiscordUserIds).toEqual([]);
  });
});

/* ===========================================================================
 * POST
 * =========================================================================*/

describe('POST /api/bot/v1/moderation/blacklist', () => {
  it('403 acteur Discord NON-staff', async () => {
    store.player_blacklist = [] as any;
    const res = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: PLAYER_DISCORD, battleTag: 'Foo#1' } },
        'POST'
      ),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(store.player_blacklist as any[]).toHaveLength(0);
  });

  it('201 acteur staff → crée l’entrée (battle_tag normalisé, notes acteur)', async () => {
    store.player_blacklist = [] as any;
    const res = makeRes();
    await handler(
      makeReq(
        {
          body: {
            actorDiscordUserId: STAFF_DISCORD,
            battleTag: '  CHEATER#9 ',
            reason: 'aimbot',
          },
        },
        'POST'
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const entry = (res.body as any).entry;
    expect(entry.battleTag).toBe('cheater#9');
    expect(entry.reason).toBe('aimbot');

    const row = (store.player_blacklist as any[]).find(
      (r) => r.id === entry.id
    );
    expect(row.tenant_id).toBe(CONFERENCE_TENANT_ID);
    expect(row.banned_by).toBeNull();
    expect(row.notes).toBe(`added via Discord by ${STAFF_DISCORD}`);
    expect(row.active).toBe(true);
  });

  it('400 quand aucun identifiant fourni', async () => {
    const res = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: STAFF_DISCORD, reason: 'x' } },
        'POST'
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* ===========================================================================
 * DELETE — 3 sélecteurs
 * =========================================================================*/

describe('DELETE /api/bot/v1/moderation/blacklist', () => {
  it('200 soft-disable par { id }', async () => {
    seedEntries();
    const res = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: STAFF_DISCORD, id: ENTRY_ACTIVE } },
        'DELETE'
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).removed).toBe(1);
    const row = (store.player_blacklist as any[]).find(
      (r) => r.id === ENTRY_ACTIVE
    );
    expect(row.active).toBe(false);
  });

  it('200 soft-disable par { discordUserId }', async () => {
    seedEntries();
    const res = makeRes();
    await handler(
      makeReq(
        {
          body: {
            actorDiscordUserId: STAFF_DISCORD,
            discordUserId: '111111111111111111',
          },
        },
        'DELETE'
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).removed).toBe(1);
    const row = (store.player_blacklist as any[]).find(
      (r) => r.id === ENTRY_ACTIVE
    );
    expect(row.active).toBe(false);
  });

  it('200 soft-disable par { battleTag } (normalisé lowercase)', async () => {
    seedEntries();
    const res = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: STAFF_DISCORD, battleTag: 'ALPHA#1' } },
        'DELETE'
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).removed).toBe(1);
    const row = (store.player_blacklist as any[]).find(
      (r) => r.id === ENTRY_ACTIVE
    );
    expect(row.active).toBe(false);
  });

  it('404 quand aucune entrée active ne correspond', async () => {
    seedEntries();
    const res = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: STAFF_DISCORD, battleTag: 'inconnu#0' } },
        'DELETE'
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE idempotent : rejouer ne double pas l’effet', async () => {
    seedEntries();
    // 1er appel : désactive.
    const res1 = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: STAFF_DISCORD, id: ENTRY_ACTIVE } },
        'DELETE'
      ),
      res1
    );
    expect(res1.statusCode).toBe(200);

    // 2e appel : l'entrée n'est plus active → 404, mais aucun double effet :
    // toujours exactement une entrée pour cet id et elle reste inactive.
    const res2 = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: STAFF_DISCORD, id: ENTRY_ACTIVE } },
        'DELETE'
      ),
      res2
    );
    expect(res2.statusCode).toBe(404);

    const rows = (store.player_blacklist as any[]).filter(
      (r) => r.id === ENTRY_ACTIVE
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(false);
  });

  it('403 DELETE par acteur non-staff', async () => {
    seedEntries();
    const res = makeRes();
    await handler(
      makeReq(
        { body: { actorDiscordUserId: PLAYER_DISCORD, id: ENTRY_ACTIVE } },
        'DELETE'
      ),
      res
    );
    expect(res.statusCode).toBe(403);
    const row = (store.player_blacklist as any[]).find(
      (r) => r.id === ENTRY_ACTIVE
    );
    expect(row.active).toBe(true);
  });
});
