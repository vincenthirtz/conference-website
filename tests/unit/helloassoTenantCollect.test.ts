// Encaissement par espace : chaque structure encaisse ses cagnottes sur SON
// compte HelloAsso (correctif Q036).
// Targets : utils/billing/helloassoAccount.ts, pages/api/helloasso/{webhook,prize-checkout}.ts,
//           pages/api/admin/{helloasso/credentials, tournaments/[id]/prize-pool}.ts
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. L'ARGENT VA À LA BONNE STRUCTURE. Un espace sans compte relié ne peut ni
//      ouvrir une cagnotte ni recevoir un paiement — auparavant, tout arrivait
//      sur le compte de l'association, sans moyen de reverser.
//   2. LE PAIEMENT PART SUR LES IDENTIFIANTS DE L'ESPACE, et porte le nom du
//      tournoi (c'est ce que l'association lit dans son back-office).
//   3. UN JETON DE NOTIFICATION PAR ESPACE : une association ne peut pas
//      déclarer un paiement pour la cagnotte d'une autre.
//   4. L'ESPACE HISTORIQUE NE CHANGE PAS : il encaisse sur le compte de
//      l'association, sans rien relier.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const secrets = vi.hoisted(() => new Map<string, string>());
vi.mock('@/utils/integrationSecrets', () => ({
  INTEGRATION_SECRET_KEYS: [],
  isSecretEncryptionConfigured: () => true,
  getIntegrationSecret: vi.fn(
    async (tenantId: string, key: string) =>
      secrets.get(`${tenantId}:${key}`) ?? null
  ),
  hasIntegrationSecret: vi.fn(async (tenantId: string, key: string) =>
    secrets.has(`${tenantId}:${key}`)
  ),
  setIntegrationSecret: vi.fn(
    async (tenantId: string, key: string, value: string) => {
      secrets.set(`${tenantId}:${key}`, value);
    }
  ),
  deleteIntegrationSecret: vi.fn(async (tenantId: string, key: string) => {
    secrets.delete(`${tenantId}:${key}`);
  }),
}));

const createCheckoutIntent = vi.hoisted(() =>
  vi.fn(async (_opts: Record<string, unknown>) => ({
    id: 987,
    redirectUrl: 'https://helloasso.test/pay',
  }))
);
const verifyHelloAssoCredentials = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true as const, organizationName: 'Ligue Valo' }))
);
vi.mock('@/utils/helloasso', async () => {
  const real =
    await vi.importActual<typeof import('../../utils/helloasso')>(
      '@/utils/helloasso'
    );
  return { ...real, createCheckoutIntent, verifyHelloAssoCredentials };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { __resetTenantSlugCacheForTests } from '../../utils/tenant';
import {
  canCollectForTenant,
  helloAssoWebhookToken,
  isValidWebhookToken,
  resolveCollectingAccount,
} from '../../utils/billing/helloassoAccount';
import { buildPrizeCheckoutMetadata } from '../../utils/billing/prizePoolFunding';

import webhookHandler from '../../pages/api/helloasso/webhook';
import prizeCheckoutHandler from '../../pages/api/helloasso/prize-checkout';
import adminPrizePoolHandler from '../../pages/api/admin/tournaments/[id]/prize-pool';
import credentialsHandler from '../../pages/api/admin/helloasso/credentials';

const PLATFORM_TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';
const THIRD_TENANT = 'bbbbbbbb-0000-4000-8000-000000000002';
const TOURNAMENT = 'cccccccc-0000-4000-8000-000000000003';
const POOL = 'dddddddd-0000-4000-8000-000000000004';
const OTHER_POOL = 'eeeeeeee-0000-4000-8000-000000000005';
const STAFF = 'ffffffff-0000-4000-8000-000000000006';

const ORIG_ENV = { ...process.env };

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

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t-owner' },
    cookies: { staff_active_tenant_id: OTHER_TENANT },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function connectTenant(tenantId = OTHER_TENANT) {
  secrets.set(`${tenantId}:helloasso_client_id`, 'client-id');
  secrets.set(`${tenantId}:helloasso_client_secret`, 'client-secret');
  secrets.set(`${tenantId}:helloasso_org_slug`, 'ligue-valo');
}

function seedPool(over: Record<string, unknown> = {}) {
  store.tournament_prize_pools = [
    {
      id: POOL,
      tournament_id: TOURNAMENT,
      tenant_id: OTHER_TENANT,
      currency: 'EUR',
      base_amount_cents: 0,
      raised_amount_cents: 0,
      is_open: true,
      ...over,
    },
  ] as any;
  store.tournaments = [
    { id: TOURNAMENT, tenant_id: OTHER_TENANT, name: 'Ligue Valo — Saison 1' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  __resetTenantSlugCacheForTests();
  secrets.clear();
  createCheckoutIntent.mockClear();
  verifyHelloAssoCredentials.mockClear();
  process.env.HELLOASSO_WEBHOOK_SECRET = 'platform-webhook-secret';
  setAuthUser({ id: 'user-owner' });
  store.staff = [
    {
      id: STAFF,
      auth_user_id: 'user-owner',
      email: 'owner@example.com',
      role: 'owner',
      is_pole_admin: false,
    },
  ] as any;
  store.tenants = [
    {
      id: OTHER_TENANT,
      slug: 'ligue-valo',
      name: 'Ligue Valo',
      is_active: true,
    },
    { id: THIRD_TENANT, slug: 'autre', name: 'Autre', is_active: true },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

describe('quel compte encaisse', () => {
  it('espace historique : le compte de l’association, rien à relier', async () => {
    expect(await resolveCollectingAccount(PLATFORM_TENANT)).toEqual({
      source: 'platform',
    });
    expect(await canCollectForTenant(PLATFORM_TENANT)).toBe(true);
  });

  it('autre espace sans compte relié : aucun encaissement possible', async () => {
    expect(await resolveCollectingAccount(OTHER_TENANT)).toBeNull();
    expect(await canCollectForTenant(OTHER_TENANT)).toBe(false);
  });

  it('autre espace relié : ses propres identifiants', async () => {
    connectTenant();
    expect(await resolveCollectingAccount(OTHER_TENANT)).toEqual({
      source: 'tenant',
      credentials: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        orgSlug: 'ligue-valo',
      },
    });
    expect(await canCollectForTenant(OTHER_TENANT)).toBe(true);
  });

  it('un compte incomplet ne vaut pas un compte', async () => {
    secrets.set(`${OTHER_TENANT}:helloasso_client_id`, 'client-id');
    expect(await resolveCollectingAccount(OTHER_TENANT)).toBeNull();
  });
});

describe('jeton de notification', () => {
  it('diffère d’un espace à l’autre, et ne vaut que pour le sien', () => {
    const a = helloAssoWebhookToken(OTHER_TENANT) as string;
    const b = helloAssoWebhookToken(THIRD_TENANT) as string;
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    expect(isValidWebhookToken(OTHER_TENANT, a)).toBe(true);
    expect(isValidWebhookToken(OTHER_TENANT, b)).toBe(false);
    // Le secret de la plateforme n'ouvre pas la porte d'un espace.
    expect(isValidWebhookToken(OTHER_TENANT, 'platform-webhook-secret')).toBe(
      false
    );
  });

  it('sans secret plateforme, aucun jeton n’est fabriqué', () => {
    process.env.HELLOASSO_WEBHOOK_SECRET = '';
    expect(helloAssoWebhookToken(OTHER_TENANT)).toBeNull();
    expect(isValidWebhookToken(OTHER_TENANT, 'x')).toBe(false);
  });
});

describe('POST /api/helloasso/prize-checkout', () => {
  it('refuse tant que l’espace n’a pas relié de compte', async () => {
    seedPool();
    const res = makeRes();
    await prizeCheckoutHandler(
      makeReq({
        url: '/api/helloasso/prize-checkout?tenant=ligue-valo',
        body: { tournamentId: TOURNAMENT, amountCents: 2000 },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('HELLOASSO_NOT_CONNECTED');
    expect(createCheckoutIntent).not.toHaveBeenCalled();
  });

  it('paie sur le compte de l’espace, avec le nom du tournoi', async () => {
    connectTenant();
    seedPool();
    const res = makeRes();
    await prizeCheckoutHandler(
      makeReq({
        url: '/api/helloasso/prize-checkout?tenant=ligue-valo',
        body: { tournamentId: TOURNAMENT, amountCents: 2000 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const args = createCheckoutIntent.mock.calls[0]?.[0] as any;
    expect(args.credentials).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      orgSlug: 'ligue-valo',
    });
    expect(args.itemName).toContain('Ligue Valo — Saison 1');
    expect(args.metadata).toEqual(
      buildPrizeCheckoutMetadata(POOL, OTHER_TENANT)
    );
  });
});

describe('PUT /api/admin/tournaments/[id]/prize-pool', () => {
  beforeEach(() => {
    store.tournaments = [
      { id: TOURNAMENT, tenant_id: OTHER_TENANT, name: 'Ligue Valo' },
    ] as any;
    store.tenant_staff = [
      { tenant_id: OTHER_TENANT, staff_id: STAFF, role: 'owner' },
    ] as any;
  });

  it('refuse d’OUVRIR une cagnotte sans compte relié', async () => {
    const res = makeRes();
    await adminPrizePoolHandler(
      makeReq({
        method: 'PUT',
        query: { id: TOURNAMENT },
        body: { is_open: true },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('HELLOASSO_NOT_CONNECTED');
    expect(store.tournament_prize_pools ?? []).toHaveLength(0);
  });

  it('laisse PRÉPARER une cagnotte fermée', async () => {
    const res = makeRes();
    await adminPrizePoolHandler(
      makeReq({
        method: 'PUT',
        query: { id: TOURNAMENT },
        body: { base_amount_cents: 5000 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.tournament_prize_pools as any[])[0].is_open).toBe(false);
  });

  it('ouvre une fois le compte relié', async () => {
    connectTenant();
    const res = makeRes();
    await adminPrizePoolHandler(
      makeReq({
        method: 'PUT',
        query: { id: TOURNAMENT },
        body: { is_open: true },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.tournament_prize_pools as any[])[0].is_open).toBe(true);
  });
});

describe('webhook — une notification ne parle que pour son espace', () => {
  function paymentEvent(poolId: string, tenantId: string) {
    return {
      eventType: 'Payment',
      data: {
        id: 4242,
        amount: 2500,
        state: 'Authorized',
        metadata: buildPrizeCheckoutMetadata(poolId, tenantId),
      },
    };
  }

  beforeEach(() => {
    seedPool();
    store.tournament_prize_pools = [
      ...(store.tournament_prize_pools as any[]),
      {
        id: OTHER_POOL,
        tournament_id: TOURNAMENT,
        tenant_id: THIRD_TENANT,
        currency: 'EUR',
        base_amount_cents: 0,
        raised_amount_cents: 0,
        is_open: true,
      },
    ] as any;
  });

  it('crédite la cagnotte de l’espace qui s’authentifie', async () => {
    const res = makeRes();
    await webhookHandler(
      makeReq({
        query: {
          tenant: 'ligue-valo',
          token: helloAssoWebhookToken(OTHER_TENANT) as string,
        },
        body: paymentEvent(POOL, OTHER_TENANT),
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.prize_pool_contributions ?? []).toHaveLength(1);
  });

  it('ignore une cagnotte qui n’est pas la sienne', async () => {
    const res = makeRes();
    await webhookHandler(
      makeReq({
        query: {
          tenant: 'ligue-valo',
          token: helloAssoWebhookToken(OTHER_TENANT) as string,
        },
        body: paymentEvent(OTHER_POOL, THIRD_TENANT),
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.prize_pool_contributions ?? []).toHaveLength(0);
  });

  it('refuse un jeton qui n’est pas celui de l’espace', async () => {
    const res = makeRes();
    await webhookHandler(
      makeReq({
        query: {
          tenant: 'ligue-valo',
          token: helloAssoWebhookToken(THIRD_TENANT) as string,
        },
        body: paymentEvent(POOL, OTHER_TENANT),
      }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(store.prize_pool_contributions ?? []).toHaveLength(0);
  });

  it('le secret de la plateforme reste valable pour l’association', async () => {
    store.tournament_prize_pools = [
      {
        id: POOL,
        tournament_id: TOURNAMENT,
        tenant_id: PLATFORM_TENANT,
        currency: 'EUR',
        base_amount_cents: 0,
        raised_amount_cents: 0,
        is_open: true,
      },
    ] as any;
    const res = makeRes();
    await webhookHandler(
      makeReq({
        query: { token: 'platform-webhook-secret' },
        body: paymentEvent(POOL, PLATFORM_TENANT),
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.prize_pool_contributions ?? []).toHaveLength(1);
  });
});

describe('/api/admin/helloasso/credentials', () => {
  beforeEach(() => {
    store.tenant_staff = [
      { tenant_id: OTHER_TENANT, staff_id: STAFF, role: 'owner' },
    ] as any;
  });

  it('GET : non relié, mais l’URL de notification est déjà prête', async () => {
    const res = makeRes();
    await credentialsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.notificationUrl).toContain('tenant=ligue-valo');
    expect(res.body.notificationUrl).toContain(
      encodeURIComponent(helloAssoWebhookToken(OTHER_TENANT) as string)
    );
  });

  it('PUT : vérifie auprès de HelloAsso avant d’enregistrer', async () => {
    const res = makeRes();
    await credentialsHandler(
      makeReq({
        method: 'PUT',
        body: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          organizationSlug: 'ligue-valo',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(verifyHelloAssoCredentials).toHaveBeenCalled();
    expect(await canCollectForTenant(OTHER_TENANT)).toBe(true);
  });

  it('PUT : des identifiants refusés ne sont pas enregistrés', async () => {
    verifyHelloAssoCredentials.mockResolvedValueOnce({
      ok: false,
      error: 'Identifiants refusés par HelloAsso.',
      code: 'BAD_CREDENTIALS',
    } as any);
    const res = makeRes();
    await credentialsHandler(
      makeReq({
        method: 'PUT',
        body: {
          clientId: 'nope',
          clientSecret: 'nope',
          organizationSlug: 'ligue-valo',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(await canCollectForTenant(OTHER_TENANT)).toBe(false);
  });

  it('DELETE : délier coupe l’encaissement', async () => {
    connectTenant();
    const res = makeRes();
    await credentialsHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(200);
    expect(await canCollectForTenant(OTHER_TENANT)).toBe(false);
  });

  it('l’espace historique n’a rien à relier', async () => {
    const res = makeRes();
    store.tenants = [
      ...(store.tenants as any[]),
      {
        id: PLATFORM_TENANT,
        slug: 'conference',
        name: 'Coupe',
        is_active: true,
      },
    ] as any;
    store.tenant_staff = [
      ...(store.tenant_staff as any[]),
      { tenant_id: PLATFORM_TENANT, staff_id: STAFF, role: 'owner' },
    ] as any;
    await credentialsHandler(
      makeReq({
        method: 'PUT',
        cookies: { staff_active_tenant_id: PLATFORM_TENANT },
        body: {
          clientId: 'x',
          clientSecret: 'y',
          organizationSlug: 'owwomenscup',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('PLATFORM_ACCOUNT');
  });
});
