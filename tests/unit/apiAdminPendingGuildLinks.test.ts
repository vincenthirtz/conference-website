// tests/unit/apiAdminPendingGuildLinks.test.ts
//
// Tests pour /api/admin/pending-guild-links/* :
//  - GET liste
//  - POST .../[guildId]/claim avec tenant existant
//  - POST .../[guildId]/claim avec new_tenant
//  - DELETE .../[guildId]
//  - 403 / 400 / 404 / 409 edges

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import listHandler from '../../pages/api/admin/pending-guild-links/index';
import claimHandler from '../../pages/api/admin/pending-guild-links/[guildId]/claim';
import deleteHandler from '../../pages/api/admin/pending-guild-links/[guildId]/index';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_1 = '55555555-5555-5555-5555-555555555555';
const PENDING_GUILD = '9999999999999999999';
const NEW_GUILD = '8888888888888888888';

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
    body: undefined,
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('owner')] as any;
  store.tenants = [
    {
      id: TENANT_A,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      default_locale: 'fr',
      created_at: '2026-01-01',
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_1, role: 'admin' },
  ] as any;
  store.discord_guilds = [] as any;
  store.pending_guild_links = [
    {
      guild_id: PENDING_GUILD,
      guild_name: 'Pending Server',
      owner_discord_id: null,
      requested_at: '2026-05-20',
    },
    {
      guild_id: NEW_GUILD,
      guild_name: 'Other Pending',
      owner_discord_id: null,
      requested_at: '2026-05-21',
    },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/admin/pending-guild-links', () => {
  it('200 retourne la liste', async () => {
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).links).toHaveLength(2);
  });

  it('403 si caster (owner requis)', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('403 si manager (owner requis)', async () => {
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('403 si admin (owner requis)', async () => {
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('405 sur POST', async () => {
    const res = makeRes();
    await listHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('POST /api/admin/pending-guild-links/[guildId]/claim', () => {
  it('400 si guildId malforme', async () => {
    const res = makeRes();
    await claimHandler(
      makeReq({
        method: 'POST',
        query: { guildId: 'nope' },
        body: { tenant_id: TENANT_A },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GUILD_ID');
  });

  it('404 si guild pas en pending', async () => {
    const res = makeRes();
    await claimHandler(
      makeReq({
        method: 'POST',
        query: { guildId: '1111111111111111111' },
        body: { tenant_id: TENANT_A },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('NOT_PENDING');
  });

  it('400 si ni tenant_id ni new_tenant', async () => {
    const res = makeRes();
    await claimHandler(
      makeReq({
        method: 'POST',
        query: { guildId: PENDING_GUILD },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('MISSING_TARGET');
  });

  it('200 claim sur tenant existant + delete pending', async () => {
    const res = makeRes();
    await claimHandler(
      makeReq({
        method: 'POST',
        query: { guildId: PENDING_GUILD },
        body: { tenant_id: TENANT_A },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.guild_id).toBe(PENDING_GUILD);
    expect(body.tenant.id).toBe(TENANT_A);
    expect(body.created_tenant).toBe(false);
    expect(
      (store.discord_guilds as any[]).find((g) => g.guild_id === PENDING_GUILD)
    ).toBeDefined();
    expect(
      (store.pending_guild_links as any[]).find(
        (g) => g.guild_id === PENDING_GUILD
      )
    ).toBeUndefined();
  });

  it('200 claim avec new_tenant cree tenant + tenant_staff', async () => {
    const res = makeRes();
    await claimHandler(
      makeReq({
        method: 'POST',
        query: { guildId: NEW_GUILD },
        body: {
          new_tenant: {
            slug: 'newtenant',
            name: 'New Tenant',
            default_locale: 'fr',
          },
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.created_tenant).toBe(true);
    expect(body.tenant.slug).toBe('newtenant');
    const newId = body.tenant.id;
    // tenant_staff devrait avoir une row pour le createur sur ce nouveau tenant
    expect(
      (store.tenant_staff as any[]).find(
        (r) => r.tenant_id === newId && r.staff_id === STAFF_1
      )
    ).toBeDefined();
    // L'espace créé en rattachant un serveur démarre avec l'essai : sans lui,
    // le bot qu'on vient tout juste de rattacher répondrait 403 à tout.
    const createdTenant = (store.tenants as any[]).find((t) => t.id === newId);
    expect(createdTenant.plan).toBe('regie');
    expect(createdTenant.plan_is_trial).toBe(true);
  });

  it('400 new_tenant slug invalide', async () => {
    const res = makeRes();
    await claimHandler(
      makeReq({
        method: 'POST',
        query: { guildId: PENDING_GUILD },
        body: { new_tenant: { slug: 'BAD_SLUG', name: 'X' } },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_SLUG');
  });

  it('409 si guild deja linke ailleurs', async () => {
    store.discord_guilds = [
      { guild_id: PENDING_GUILD, tenant_id: TENANT_A, is_primary: true },
    ] as any;
    const res = makeRes();
    await claimHandler(
      makeReq({
        method: 'POST',
        query: { guildId: PENDING_GUILD },
        body: { tenant_id: TENANT_A },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('ALREADY_LINKED');
  });
});

describe('DELETE /api/admin/pending-guild-links/[guildId]', () => {
  it('200 supprime', async () => {
    const res = makeRes();
    await deleteHandler(
      makeReq({ method: 'DELETE', query: { guildId: PENDING_GUILD } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).deleted).toBe(true);
    expect(
      (store.pending_guild_links as any[]).find(
        (g) => g.guild_id === PENDING_GUILD
      )
    ).toBeUndefined();
  });

  it('404 si pas en pending', async () => {
    const res = makeRes();
    await deleteHandler(
      makeReq({ method: 'DELETE', query: { guildId: '1111111111111111111' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 si guildId malforme', async () => {
    const res = makeRes();
    await deleteHandler(
      makeReq({ method: 'DELETE', query: { guildId: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await deleteHandler(
      makeReq({ method: 'GET', query: { guildId: PENDING_GUILD } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
