// tests/unit/apiAdminDiscordChannels.test.ts
//
// GET /api/admin/tenants/[id]/discord-config/[guildId]/channels — le site relaie
// vers le bot (qui a discord.js) pour lister salons + rôles du serveur. On mock
// le `fetch` sortant vers le bot et on vérifie : auth staff, appartenance du
// guild au tenant, signature HMAC posée, et propagation des erreurs du bot.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import { store, resetSupabaseMock, setAuthUser } from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import channelsHandler from '../../pages/api/admin/tenants/[id]/discord-config/[guildId]/channels';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_1 = '55555555-5555-5555-5555-555555555555';
const GUILD_ID = '1234567890123456789';
const OTHER_GUILD = '9876543210987654321';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'owner'
): StaffMember {
  return {
    id: STAFF_1,
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: false,
  };
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-1' },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
  };
}

const BOT_INVENTORY = {
  guild: { id: GUILD_ID, name: 'Test Guild' },
  channels: [{ id: 'c1', name: 'général', type: 0, parentId: null, position: 1 }],
  roles: [{ id: 'r1', name: 'Admin', color: 255, position: 5, managed: false }],
};

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  process.env.BOT_WEBHOOK_URL = 'https://bot.example/bot/site-events';
  store.staff = [makeStaffRow('owner')] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_1, role: 'admin', created_at: '2026-01-01' },
  ] as any;
  store.discord_guilds = [
    { guild_id: GUILD_ID, tenant_id: TENANT_A, is_primary: true, created_at: '2026-01-01' },
  ] as any;
  store.tenant_secrets = [
    { tenant_id: TENANT_A, bot_webhook_secret: 'sek-hmac' },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/admin/tenants/[id]/discord-config/[guildId]/channels', () => {
  it('relaie l’inventaire du bot avec une signature HMAC + timestamp', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => BOT_INVENTORY,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await channelsHandler(
      makeReq({ query: { id: TENANT_A, guildId: GUILD_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(BOT_INVENTORY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toContain('/bot/guild-inventory');
    expect(url).toContain(`guildId=${GUILD_ID}`);
    expect(opts.headers['X-Webhook-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof opts.headers['X-Webhook-Timestamp']).toBe('string');
  });

  it('refuse un guild non rattaché au tenant → 404', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await channelsHandler(
      makeReq({ query: { id: TENANT_A, guildId: OTHER_GUILD } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propage un 404 du bot (bot absent du serveur)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    );
    const res = makeRes();
    await channelsHandler(
      makeReq({ query: { id: TENANT_A, guildId: GUILD_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('503 si le secret webhook du tenant est absent', async () => {
    store.tenant_secrets = [] as any;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await channelsHandler(
      makeReq({ query: { id: TENANT_A, guildId: GUILD_ID } }),
      res
    );
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuse un caster (role < manager) → 403', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await channelsHandler(
      makeReq({ query: { id: TENANT_A, guildId: GUILD_ID } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});
