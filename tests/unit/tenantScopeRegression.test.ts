// tests/unit/tenantScopeRegression.test.ts
//
// Régression de la faille « owner d'un espace → n'importe quel espace ».
//
// Le rôle EFFECTIF est élevé par `tenant_staff.role` sur l'espace ACTIF : le
// propriétaire de l'espace A porte `owner` chez lui. Les routes
// `tenants/[id]/*` agissent sur l'espace de l'URL — sans règle de périmètre,
// il visait B par son id : rotation des secrets du bot (clé en clair dans la
// réponse), ajout de soi en owner, export complet, fermeture.
//
// Règle unique (features/admin/tenants/service/scope.ts, assertTenantInScope) :
// membre de l'espace visé, ou pôle-admin. AUCUNE exception par rôle global.
// Refus : 403 `TENANT_OUT_OF_SCOPE`, AVANT toute lecture/écriture.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';

import rotateHandler from '../../pages/api/admin/tenants/[id]/rotate-secrets';
import staffHandler from '../../pages/api/admin/tenants/[id]/staff/index';
import exportHandler from '../../pages/api/admin/tenants/[id]/export';
import lifecycleHandler from '../../pages/api/admin/tenants/[id]/lifecycle';
import meHandler from '../../pages/api/admin/me';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ATTACKER = 'staff-a';
const OUT_OF_SCOPE = 'Cet espace ne fait pas partie de votre périmètre.';

let n = 0;
function makeReq(over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-scope-${n}` },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: { id: TENANT_B },
    body: {},
    socket: { remoteAddress: `10.0.0.${n % 250}` },
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as any,
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
    end() {
      return this;
    },
  };
}

/** Le staff appelant : rôle global, pôle-admin, rattachements. */
function seedCaller(opts: {
  globalRole: 'owner' | 'admin' | 'caster';
  poleAdmin?: boolean;
  memberships: Array<{ tenant: string; role: string }>;
}) {
  store.staff = [
    {
      id: ATTACKER,
      auth_user_id: 'user-a',
      email: 'a@a.com',
      role: opts.globalRole,
      is_pole_admin: opts.poleAdmin === true,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'staff-victim',
      auth_user_id: 'user-v',
      email: 'v@v.com',
      role: 'caster',
      is_pole_admin: false,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_B, staff_id: 'staff-victim', role: 'owner' },
    ...opts.memberships.map((m) => ({
      tenant_id: m.tenant,
      staff_id: ATTACKER,
      role: m.role,
    })),
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-a' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.tenants = [
    {
      id: TENANT_A,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      lifecycle_state: 'active',
    },
    {
      id: TENANT_B,
      slug: 'beta',
      name: 'Beta',
      is_active: true,
      lifecycle_state: 'active',
    },
  ] as any;
  store.tenant_secrets = [
    {
      tenant_id: TENANT_B,
      bot_api_key_hash: 'hash-b',
      bot_webhook_secret: 'secret-b',
      previous_key_hash: null,
      previous_key_expires_at: null,
    },
  ] as any;
});

/** Les quatre gestes de la faille, et ce qu'ils ne doivent PAS avoir fait. */
const ATTACKS = [
  {
    name: 'rotate-secrets',
    run: (res: any) => rotateHandler(makeReq(), res),
    untouched: () =>
      expect((store.tenant_secrets as any[])[0].bot_api_key_hash).toBe(
        'hash-b'
      ),
  },
  {
    name: 'staff POST (s’ajouter owner)',
    run: (res: any) =>
      staffHandler(
        makeReq({ body: { staff_id: ATTACKER_UUID(), role: 'owner' } }),
        res
      ),
    untouched: () =>
      expect(
        (store.tenant_staff as any[]).filter((r) => r.tenant_id === TENANT_B)
      ).toHaveLength(1),
  },
  {
    name: 'export',
    run: (res: any) => exportHandler(makeReq(), res),
    untouched: () => undefined,
  },
  {
    name: 'lifecycle',
    run: (res: any) =>
      lifecycleHandler(
        makeReq({
          body: { state: 'suspended', reason: 'prise de contrôle hostile' },
        }),
        res
      ),
    untouched: () =>
      expect(
        (store.tenants as any[]).find((t) => t.id === TENANT_B).lifecycle_state
      ).toBe('active'),
  },
] as const;

/** L'id de staff doit être un UUID pour `staff POST` : on en injecte un. */
function ATTACKER_UUID() {
  return 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
}

describe('owner de l’espace A → espace B : 403 TENANT_OUT_OF_SCOPE', () => {
  for (const attack of ATTACKS) {
    it(`${attack.name} : propriétaire d’espace (rôle global caster)`, async () => {
      seedCaller({
        globalRole: 'caster',
        memberships: [{ tenant: TENANT_A, role: 'owner' }],
      });
      const res = makeRes();
      await attack.run(res);
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({
        error: OUT_OF_SCOPE,
        code: 'TENANT_OUT_OF_SCOPE',
      });
      attack.untouched();
      // Rien au journal : le geste n'a pas eu lieu.
      expect(store.staff_logs ?? []).toEqual([]);
    });

    it(`${attack.name} : owner GLOBAL non membre, non pôle-admin`, async () => {
      seedCaller({
        globalRole: 'owner',
        memberships: [{ tenant: TENANT_A, role: 'owner' }],
      });
      const res = makeRes();
      await attack.run(res);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('TENANT_OUT_OF_SCOPE');
      attack.untouched();
    });
  }

  it('la réponse de rotate-secrets refusée ne contient aucun secret', async () => {
    seedCaller({
      globalRole: 'caster',
      memberships: [{ tenant: TENANT_A, role: 'owner' }],
    });
    const res = makeRes();
    await rotateHandler(makeReq(), res);
    expect(res.body.botApiKey).toBeUndefined();
    expect(res.body.botWebhookSecret).toBeUndefined();
  });
});

describe('accès légitimes', () => {
  it('un pôle-admin agit sur B sans en être membre', async () => {
    seedCaller({ globalRole: 'owner', poleAdmin: true, memberships: [] });
    const rot = makeRes();
    await rotateHandler(makeReq(), rot);
    expect(rot.statusCode).toBe(200);
    expect(rot.body.tenantId).toBe(TENANT_B);

    const life = makeRes();
    await lifecycleHandler(
      makeReq({ body: { state: 'suspended', reason: 'impayé depuis 3 mois' } }),
      life
    );
    expect(life.statusCode).toBe(200);

    const exp = makeRes();
    await exportHandler(makeReq(), exp);
    expect(exp.statusCode).toBe(200);
  });

  it('un membre owner de B agit sur B (espace actif B)', async () => {
    seedCaller({
      globalRole: 'caster',
      memberships: [
        { tenant: TENANT_A, role: 'owner' },
        { tenant: TENANT_B, role: 'owner' },
      ],
    });
    const cookies = { staff_active_tenant_id: TENANT_B };
    const rot = makeRes();
    await rotateHandler(makeReq({ cookies }), rot);
    expect(rot.statusCode).toBe(200);

    store.staff = [
      ...(store.staff as any[]),
      {
        id: ATTACKER_UUID(),
        auth_user_id: 'u-new',
        email: 'n@n.com',
        role: 'caster',
      },
    ] as any;
    const add = makeRes();
    await staffHandler(
      makeReq({ cookies, body: { staff_id: ATTACKER_UUID(), role: 'admin' } }),
      add
    );
    expect(add.statusCode).toBe(200);
  });
});

describe('/api/admin/me : rôle EFFECTIF sur l’espace actif', () => {
  it('rôle global caster + owner chez lui → role owner, global_role caster', async () => {
    seedCaller({
      globalRole: 'caster',
      memberships: [{ tenant: TENANT_A, role: 'owner' }],
    });
    const res = makeRes();
    await meHandler(makeReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('owner');
    expect(res.body.global_role).toBe('caster');
    // La console développeur (facturation, clés, webhooks) reste visible.
    expect(res.body.permissions).toEqual(
      expect.arrayContaining(['manage_billing', 'manage_settings'])
    );
  });
});
