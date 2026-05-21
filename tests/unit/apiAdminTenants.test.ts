// tests/unit/apiAdminTenants.test.ts
//
// Tests pour les endpoints /api/admin/tenants/* et sous-ressources :
//  - GET /api/admin/tenants/accessible
//  - GET /api/admin/tenants
//  - POST /api/admin/tenants
//  - GET / PATCH / DELETE /api/admin/tenants/[id]
//  - GET / PUT /api/admin/tenants/[id]/discord-config*
//  - GET / POST /api/admin/tenants/[id]/staff*
//  - DELETE /api/admin/tenants/[id]/staff/[staffId]

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import accessibleHandler from '../../pages/api/admin/tenants/accessible';
import indexHandler from '../../pages/api/admin/tenants/index';
import detailHandler from '../../pages/api/admin/tenants/[id]';
import discordConfigList from '../../pages/api/admin/tenants/[id]/discord-config/index';
import discordConfigPut from '../../pages/api/admin/tenants/[id]/discord-config/[guildId]';
import staffList from '../../pages/api/admin/tenants/[id]/staff/index';
import staffDelete from '../../pages/api/admin/tenants/[id]/staff/[staffId]';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONFERENCE_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_1 = '55555555-5555-5555-5555-555555555555';
const OTHER_STAFF = '99999999-9999-9999-9999-999999999999';
const GUILD_ID = '1234567890123456789';

function makeStaffRow(
  role: 'admin' | 'manager' | 'caster' = 'admin'
): StaffMember {
  return {
    id: STAFF_1,
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-1' },
    cookies: { staff_active_tenant_id: TENANT_A },
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
  store.staff = [
    makeStaffRow('admin'),
    {
      id: OTHER_STAFF,
      auth_user_id: 'other-user',
      email: 'o@o.com',
      role: 'admin',
      display_name: 'Other',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    } as any,
  ] as any;
  store.tenants = [
    {
      id: TENANT_A,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      default_locale: 'fr',
      created_at: '2026-01-01',
    },
    {
      id: TENANT_B,
      slug: 'beta',
      name: 'Beta',
      is_active: true,
      default_locale: 'fr',
      created_at: '2026-01-01',
    },
    {
      id: CONFERENCE_ID,
      slug: 'conference',
      name: 'Conférence',
      is_active: true,
      default_locale: 'fr',
      created_at: '2026-01-01',
    },
  ] as any;
  store.tenant_staff = [
    {
      tenant_id: TENANT_A,
      staff_id: STAFF_1,
      role: 'admin',
      created_at: '2026-01-01',
    },
    {
      tenant_id: CONFERENCE_ID,
      staff_id: STAFF_1,
      role: 'admin',
      created_at: '2026-01-01',
    },
  ] as any;
  store.discord_guilds = [
    {
      guild_id: GUILD_ID,
      tenant_id: TENANT_A,
      is_primary: true,
      created_at: '2026-01-01',
    },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * GET /api/admin/tenants/accessible
 * =========================================================================*/

describe('GET /api/admin/tenants/accessible', () => {
  it('retourne les tenants accessibles tries par slug', async () => {
    const res = makeRes();
    await accessibleHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tenants).toHaveLength(2);
    expect(body.tenants[0].slug).toBe('alpha');
    expect(body.tenants[1].slug).toBe('conference');
  });

  it('405 sur POST', async () => {
    const res = makeRes();
    await accessibleHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* ===========================================================================
 * GET / POST /api/admin/tenants
 * =========================================================================*/

describe('/api/admin/tenants', () => {
  it('GET 200 avec guild_count + staff_count', async () => {
    const res = makeRes();
    await indexHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tenants).toHaveLength(3);
    const alpha = body.tenants.find((t: any) => t.slug === 'alpha');
    expect(alpha.guild_count).toBe(1);
    expect(alpha.staff_count).toBe(1);
  });

  it('GET 403 si caster (role insuffisant)', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await indexHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 slug invalide', async () => {
    const res = makeRes();
    await indexHandler(
      makeReq({ method: 'POST', body: { slug: 'INVALID SLUG', name: 'X' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_SLUG');
  });

  it('POST 400 name vide', async () => {
    const res = makeRes();
    await indexHandler(
      makeReq({ method: 'POST', body: { slug: 'newone', name: '' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_NAME');
  });

  it('POST 201 cree tenant + auto-add createur dans tenant_staff', async () => {
    const res = makeRes();
    await indexHandler(
      makeReq({
        method: 'POST',
        body: { slug: 'newone', name: 'New One', default_locale: 'fr' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.tenant.slug).toBe('newone');
    expect(body.tenant.is_active).toBe(true);
    const createdId = body.tenant.id;
    const ts = (store.tenant_staff as any[]).find(
      (r) => r.tenant_id === createdId && r.staff_id === STAFF_1
    );
    expect(ts).toBeDefined();
  });
});

/* ===========================================================================
 * GET / PATCH / DELETE /api/admin/tenants/[id]
 * =========================================================================*/

describe('/api/admin/tenants/[id]', () => {
  it('GET 200 + tenant + guilds + staff', async () => {
    const res = makeRes();
    await detailHandler(makeReq({ query: { id: TENANT_A } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tenant.id).toBe(TENANT_A);
    expect(body.guilds).toHaveLength(1);
    expect(body.staff).toHaveLength(1);
  });

  it('GET 400 si id non UUID', async () => {
    const res = makeRes();
    await detailHandler(makeReq({ query: { id: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET 403 si caster sans acces au tenant', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await detailHandler(
      makeReq({
        query: { id: TENANT_B },
        cookies: { staff_active_tenant_id: TENANT_A },
      }),
      res
    );
    // caster + pas dans tenant_staff(TENANT_B) → 403
    // mais ctx.tenantId = TENANT_A (cookie sera ignore car pas accessible non plus selon mock)
    expect(res.statusCode).toBe(403);
  });

  it('PATCH refuse slug', async () => {
    const res = makeRes();
    await detailHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TENANT_A },
        body: { slug: 'renamed' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('SLUG_IMMUTABLE');
  });

  it('PATCH 200 update name', async () => {
    const res = makeRes();
    await detailHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TENANT_A },
        body: { name: 'Alpha renamed' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tenant.name).toBe('Alpha renamed');
  });

  it('DELETE 403 sur conference (slug protege)', async () => {
    const res = makeRes();
    await detailHandler(
      makeReq({ method: 'DELETE', query: { id: CONFERENCE_ID } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('TENANT_PROTECTED');
  });

  it('DELETE 200 soft-delete (is_active=false)', async () => {
    const res = makeRes();
    await detailHandler(
      makeReq({ method: 'DELETE', query: { id: TENANT_B } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tenant.is_active).toBe(false);
  });
});

/* ===========================================================================
 * GET /api/admin/tenants/[id]/discord-config
 * PUT /api/admin/tenants/[id]/discord-config/[guildId]
 * =========================================================================*/

describe('/api/admin/tenants/[id]/discord-config', () => {
  it('GET 200 liste avec defaults si pas de row', async () => {
    const res = makeRes();
    await discordConfigList(makeReq({ query: { id: TENANT_A } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.configs).toHaveLength(1);
    expect(body.configs[0].guild_id).toBe(GUILD_ID);
    expect(body.configs[0].staff_role_owner_id).toBeNull();
    expect(body.configs[0].staff_role_admin_id).toBeNull();
    expect(body.configs[0].staff_role_manager_id).toBeNull();
    expect(body.configs[0].staff_role_caster_id).toBeNull();
    expect(body.configs[0].staff_log_channel_id).toBeNull();
  });

  it('PUT 400 si guildId malforme', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: 'nope' },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 404 si guild pas dans le tenant', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_B, guildId: GUILD_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('GUILD_NOT_IN_TENANT');
  });

  it('PUT 400 si snowflake invalide', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: GUILD_ID },
        body: { staff_log_channel_id: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_SNOWFLAKE');
  });

  it('PUT 400 si staff_role_admin_id n est pas un snowflake', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: GUILD_ID },
        body: { staff_role_admin_id: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_SNOWFLAKE');
    expect((res.body as any).field).toBe('staff_role_admin_id');
  });

  it('PUT 200 upsert config (incluant les 4 staff_role_*_id)', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: GUILD_ID },
        body: {
          staff_log_channel_id: '9876543210123456789',
          staff_role_owner_id: '1111111111111111111',
          staff_role_admin_id: '2222222222222222222',
          staff_role_manager_id: null,
          staff_role_caster_id: null,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

/* ===========================================================================
 * GET / POST /api/admin/tenants/[id]/staff
 * DELETE /api/admin/tenants/[id]/staff/[staffId]
 * =========================================================================*/

describe('/api/admin/tenants/[id]/staff', () => {
  it('GET 200 liste le staff', async () => {
    const res = makeRes();
    await staffList(makeReq({ query: { id: TENANT_A } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.staff).toHaveLength(1);
    expect(body.staff[0].staff_id).toBe(STAFF_1);
  });

  it('POST 400 si staff_id non UUID', async () => {
    const res = makeRes();
    await staffList(
      makeReq({
        method: 'POST',
        query: { id: TENANT_A },
        body: { staff_id: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_STAFF_ID');
  });

  it('POST 404 si staff inconnu globalement', async () => {
    const res = makeRes();
    await staffList(
      makeReq({
        method: 'POST',
        query: { id: TENANT_A },
        body: { staff_id: '11111111-1111-1111-1111-111111111111' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('STAFF_NOT_FOUND');
  });

  it('POST 200 ajoute un staff au tenant', async () => {
    const res = makeRes();
    await staffList(
      makeReq({
        method: 'POST',
        query: { id: TENANT_B },
        body: { staff_id: OTHER_STAFF, role: 'admin' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.tenant_staff as any[]).find(
      (r) => r.tenant_id === TENANT_B && r.staff_id === OTHER_STAFF
    );
    expect(row).toBeDefined();
  });

  it('DELETE 409 si dernier admin', async () => {
    // TENANT_A n'a que staff-1 comme admin → ne devrait pas pouvoir le
    // retirer.
    const res = makeRes();
    await staffDelete(
      makeReq({
        method: 'DELETE',
        query: { id: TENANT_A, staffId: STAFF_1 },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('LAST_ADMIN');
  });

  it('DELETE 200 si pas le dernier admin', async () => {
    // Ajoute un second admin sur TENANT_A
    (store.tenant_staff as any[]).push({
      tenant_id: TENANT_A,
      staff_id: OTHER_STAFF,
      role: 'admin',
    });
    const res = makeRes();
    await staffDelete(
      makeReq({
        method: 'DELETE',
        query: { id: TENANT_A, staffId: OTHER_STAFF },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).deleted).toBe(true);
  });

  it('DELETE 404 si staff pas dans le tenant', async () => {
    const res = makeRes();
    await staffDelete(
      makeReq({
        method: 'DELETE',
        query: { id: TENANT_A, staffId: OTHER_STAFF },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
