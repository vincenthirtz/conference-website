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
import poleAdminToggle from '../../pages/api/admin/staff/[staffId]/pole-admin';
import {
  canAccessTenant,
  listAccessibleTenants,
  invalidateTenantAccessCache,
} from '../../utils/adminTenants';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONFERENCE_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_1 = '55555555-5555-5555-5555-555555555555';
const OTHER_STAFF = '99999999-9999-9999-9999-999999999999';
const GUILD_ID = '1234567890123456789';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'owner',
  opts: { is_pole_admin?: boolean } = {}
): StaffMember {
  return {
    id: STAFF_1,
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: opts.is_pole_admin ?? false,
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
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [
    makeStaffRow('owner'),
    {
      id: OTHER_STAFF,
      auth_user_id: 'other-user',
      email: 'o@o.com',
      role: 'admin',
      display_name: 'Other',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
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

  it('pole_admin: retourne tous les tenants actifs', async () => {
    // STAFF_1 devient pole_admin (cross-tenant). On retire ses rows
    // tenant_staff pour prouver que le bypass ne depend pas d'elles.
    store.staff = [makeStaffRow('owner', { is_pole_admin: true })] as any;
    invalidateStaffCache();
    store.tenant_staff = [] as any;
    const res = makeRes();
    await accessibleHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    // 3 tenants actifs : alpha, beta, conference.
    expect(body.tenants).toHaveLength(3);
    const slugs = body.tenants.map((t: any) => t.slug).sort();
    expect(slugs).toEqual(['alpha', 'beta', 'conference']);
    // role expose = pole_admin pour tous.
    expect(body.tenants.every((t: any) => t.role === 'pole_admin')).toBe(true);
  });

  it('non pole_admin: comportement actuel (uniquement tenant_staff)', async () => {
    store.staff = [makeStaffRow('owner', { is_pole_admin: false })] as any;
    invalidateStaffCache();
    const res = makeRes();
    await accessibleHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tenants).toHaveLength(2);
    expect(body.tenants.map((t: any) => t.slug)).toEqual([
      'alpha',
      'conference',
    ]);
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
    // Accueil des nouveaux arrivants (defauts).
    expect(body.configs[0].welcome_enabled).toBe(false);
    expect(body.configs[0].welcome_channel_id).toBeNull();
    expect(body.configs[0].welcome_message).toBeNull();
    expect(body.configs[0].welcome_dm_message).toBeNull();
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
    // STAFF_1 (owner) doit aussi avoir acces a TENANT_B pour passer la
    // verification canAccessTenant — sinon on s'arrete a 403 avant
    // d'atteindre la verification "guild appartient au tenant".
    (store.tenant_staff as any[]).push({
      tenant_id: TENANT_B,
      staff_id: STAFF_1,
      role: 'admin',
      created_at: '2026-01-01',
    });
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

  it('PUT 400 si welcome_enabled n est pas un boolean', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: GUILD_ID },
        body: { welcome_enabled: 'yes' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_WELCOME_ENABLED');
  });

  it('PUT 400 si welcome_channel_id n est pas un snowflake', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: GUILD_ID },
        body: { welcome_channel_id: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_SNOWFLAKE');
    expect((res.body as any).field).toBe('welcome_channel_id');
  });

  it('PUT 400 si welcome_message n est pas une string', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: GUILD_ID },
        body: { welcome_message: 42 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_WELCOME_MESSAGE');
    expect((res.body as any).field).toBe('welcome_message');
  });

  it('PUT 200 upsert config accueil (welcome_*)', async () => {
    const res = makeRes();
    await discordConfigPut(
      makeReq({
        method: 'PUT',
        query: { id: TENANT_A, guildId: GUILD_ID },
        body: {
          welcome_enabled: true,
          welcome_channel_id: '3333333333333333333',
          welcome_message: '  Bienvenue !  ',
          welcome_dm_message: '',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.tenant_discord_config as any[]).find(
      (r) => r.guild_id === GUILD_ID
    );
    expect(row.welcome_enabled).toBe(true);
    expect(row.welcome_channel_id).toBe('3333333333333333333');
    // Message trimme.
    expect(row.welcome_message).toBe('Bienvenue !');
    // Chaine vide -> null.
    expect(row.welcome_dm_message).toBeNull();
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

  it('POST 400 si role hors nomenclature (INVALID_ROLE)', async () => {
    const res = makeRes();
    await staffList(
      makeReq({
        method: 'POST',
        query: { id: TENANT_B },
        body: { staff_id: OTHER_STAFF, role: 'superadmin' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_ROLE');
    const row = (store.tenant_staff as any[]).find(
      (r) => r.tenant_id === TENANT_B && r.staff_id === OTHER_STAFF
    );
    expect(row).toBeUndefined();
  });

  it('POST 200 sans role → défaut admin', async () => {
    const res = makeRes();
    await staffList(
      makeReq({
        method: 'POST',
        query: { id: TENANT_B },
        body: { staff_id: OTHER_STAFF },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.tenant_staff as any[]).find(
      (r) => r.tenant_id === TENANT_B && r.staff_id === OTHER_STAFF
    );
    expect(row?.role).toBe('admin');
  });

  it('POST 200 avec un role valide de la nomenclature (caster)', async () => {
    const res = makeRes();
    await staffList(
      makeReq({
        method: 'POST',
        query: { id: TENANT_B },
        body: { staff_id: OTHER_STAFF, role: 'caster' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.tenant_staff as any[]).find(
      (r) => r.tenant_id === TENANT_B && r.staff_id === OTHER_STAFF
    );
    expect(row?.role).toBe('caster');
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

/* ===========================================================================
 * Helpers : canAccessTenant + listAccessibleTenants (pole_admin)
 * =========================================================================*/

describe('utils/adminTenants pole_admin behaviour', () => {
  it('listAccessibleTenants(pole_admin=true) → tous les tenants actifs', async () => {
    // STAFF_1 sans aucune row tenant_staff mais is_pole_admin = true.
    store.staff = [
      { ...makeStaffRow('owner'), is_pole_admin: true } as any,
    ] as any;
    store.tenant_staff = [] as any;
    const list = await listAccessibleTenants(STAFF_1);
    expect(list.map((t) => t.slug).sort()).toEqual([
      'alpha',
      'beta',
      'conference',
    ]);
    expect(list.every((t) => t.role === 'pole_admin')).toBe(true);
  });

  it('listAccessibleTenants(pole_admin=false) → uniquement tenant_staff', async () => {
    store.staff = [
      { ...makeStaffRow('owner'), is_pole_admin: false } as any,
    ] as any;
    // STAFF_1 a tenant_staff sur TENANT_A + CONFERENCE_ID (seed).
    const list = await listAccessibleTenants(STAFF_1);
    expect(list.map((t) => t.slug)).toEqual(['alpha', 'conference']);
  });

  it('canAccessTenant(isPoleAdmin hint=true) → true sans toucher tenant_staff', async () => {
    // Si le hint est fourni, l'implementation doit shortcut.
    store.tenant_staff = [] as any;
    const ok = await canAccessTenant(STAFF_1, TENANT_B, { isPoleAdmin: true });
    expect(ok).toBe(true);
  });

  it('canAccessTenant: pole_admin via SELECT bypass tenant_staff', async () => {
    // Pas de hint passe → le helper SELECT staff.is_pole_admin. Si true, bypass.
    store.staff = [
      { ...makeStaffRow('owner'), is_pole_admin: true } as any,
    ] as any;
    store.tenant_staff = [] as any;
    const ok = await canAccessTenant(STAFF_1, TENANT_B);
    expect(ok).toBe(true);
  });

  it('canAccessTenant: non pole_admin → fallback tenant_staff', async () => {
    store.staff = [
      { ...makeStaffRow('owner'), is_pole_admin: false } as any,
    ] as any;
    store.tenant_staff = [] as any;
    const ok = await canAccessTenant(STAFF_1, TENANT_B);
    expect(ok).toBe(false);
  });
});

/* ===========================================================================
 * POST/DELETE /api/admin/staff/[staffId]/pole-admin
 * =========================================================================*/

describe('/api/admin/staff/[staffId]/pole-admin', () => {
  it('POST 200 active is_pole_admin sur la cible', async () => {
    // STAFF_1 = owner active. On force OTHER_STAFF a is_pole_admin=false
    // pour pouvoir l'activer.
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'POST', query: { staffId: OTHER_STAFF } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).is_pole_admin).toBe(true);
    const updated = (store.staff as any[]).find((s) => s.id === OTHER_STAFF);
    expect(updated.is_pole_admin).toBe(true);
  });

  it('DELETE 200 desactive is_pole_admin sur la cible', async () => {
    // Pre-active OTHER_STAFF (admin role, donc pas concerne par le garde-fou
    // last-owner).
    const other = (store.staff as any[]).find((s) => s.id === OTHER_STAFF);
    other.is_pole_admin = true;
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'DELETE', query: { staffId: OTHER_STAFF } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).is_pole_admin).toBe(false);
    const updated = (store.staff as any[]).find((s) => s.id === OTHER_STAFF);
    expect(updated.is_pole_admin).toBe(false);
  });

  it('POST 403 si appelant pas owner', async () => {
    store.staff = [makeStaffRow('admin')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'POST', query: { staffId: OTHER_STAFF } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 si staffId non UUID', async () => {
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'POST', query: { staffId: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_STAFF_ID');
  });

  it('POST 404 si staff cible inconnu', async () => {
    const res = makeRes();
    await poleAdminToggle(
      makeReq({
        method: 'POST',
        query: { staffId: '00000000-0000-0000-0000-000000000000' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('STAFF_NOT_FOUND');
  });

  it('DELETE 409 si dernier owner pole_admin actif (garde-fou lockout)', async () => {
    // STAFF_1 est le seul owner actif avec is_pole_admin=true.
    store.staff = [
      { ...makeStaffRow('owner'), is_pole_admin: true } as any,
      {
        id: OTHER_STAFF,
        auth_user_id: 'other-user',
        email: 'o@o.com',
        role: 'admin',
        display_name: 'Other',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
        is_pole_admin: true,
        is_active: true,
      } as any,
    ] as any;
    invalidateStaffCache();
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'DELETE', query: { staffId: STAFF_1 } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('LAST_POLE_OWNER');
  });

  it('DELETE 200 si autre owner pole_admin actif existe', async () => {
    store.staff = [
      { ...makeStaffRow('owner'), is_pole_admin: true } as any,
      {
        id: OTHER_STAFF,
        auth_user_id: 'other-user',
        email: 'o@o.com',
        role: 'owner',
        display_name: 'Other',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
        is_pole_admin: true,
        is_active: true,
      } as any,
    ] as any;
    invalidateStaffCache();
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'DELETE', query: { staffId: STAFF_1 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).is_pole_admin).toBe(false);
  });

  it('POST no-op si deja active (changed=false)', async () => {
    const other = (store.staff as any[]).find((s) => s.id === OTHER_STAFF);
    other.is_pole_admin = true;
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'POST', query: { staffId: OTHER_STAFF } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).changed).toBe(false);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'GET', query: { staffId: OTHER_STAFF } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
