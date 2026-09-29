// tests/unit/adminTenantsModuleRoutes.test.ts
//
// Routes du module features/admin/tenants qui n'avaient pas de test avant leur
// migration sur `defineAdminRoute` (vague serveur 2) :
//   - GET  /api/admin/tenants/[id]/bot-invite
//   - GET  /api/admin/tenants/[id]/billing        (espace actif seulement)
//   - GET  /api/admin/tenants/[id]/domain
//   - GET/POST/DELETE /api/admin/tenants/[id]/api-tokens
//   - GET  /api/admin/webhooks/[id]/deliveries    (espace actif seulement)
// + deux garanties de secret : une réponse qui révèle un secret n'entre
//   JAMAIS dans le cache d'idempotence (qui stocke le corps en base), et une
//   liste de clés ne rend jamais leur empreinte.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';

import botInviteHandler from '../../pages/api/admin/tenants/[id]/bot-invite';
import billingHandler from '../../pages/api/admin/tenants/[id]/billing';
import domainHandler from '../../pages/api/admin/tenants/[id]/domain';
import tenantTokensHandler from '../../pages/api/admin/tenants/[id]/api-tokens';
import deliveriesHandler from '../../pages/api/admin/webhooks/[id]/deliveries';
import {
  API_TOKEN_LIST_COLUMNS,
  TENANT_API_TOKEN_LIST_COLUMNS,
  TENANT_DETAIL_COLUMNS,
  TENANT_REQUEST_COLUMNS,
  WEBHOOK_CREATED_COLUMNS,
  WEBHOOK_LIST_COLUMNS,
} from '../../features/admin/tenants/schemas';
import rotateHandler from '../../pages/api/admin/tenants/[id]/rotate-secrets';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNKNOWN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SUB_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUB_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

let n = 0;
function makeReq(over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-tenants-${n}` },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: {},
    body: {},
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'o@o.com',
      role: 'owner',
      display_name: 'Owner',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.tenants = [
    {
      id: TENANT_A,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      plan: 'discovery',
      plan_status: 'active',
      plan_expires_at: null,
      custom_domain: null,
      custom_domain_token: null,
    },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'owner' },
  ] as any;
});

describe('GET /api/admin/tenants/[id]/bot-invite', () => {
  it('400 INVALID_TENANT_ID sur un id non UUID', async () => {
    const res = makeRes();
    await botInviteHandler(makeReq({ query: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_TENANT_ID');
  });

  it('404 UNKNOWN_TENANT sur un espace inconnu', async () => {
    const res = makeRes();
    await botInviteHandler(makeReq({ query: { id: UNKNOWN } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('UNKNOWN_TENANT');
  });

  it('200 : lien pour CET espace, serveur pré-sélectionné si valide', async () => {
    const res = makeRes();
    await botInviteHandler(
      makeReq({ query: { id: TENANT_B, guildId: ' 123456789012345678 ' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.tenant).toMatchObject({ id: TENANT_B, slug: 'beta' });
    expect(res.body.guildId).toBe('123456789012345678');
    expect(['direct', 'manual']).toContain(res.body.mode);
  });
});

describe('GET /api/admin/tenants/[id]/billing', () => {
  it('403 TENANT_SCOPE hors de l’espace actif', async () => {
    const res = makeRes();
    await billingHandler(makeReq({ query: { id: TENANT_B } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TENANT_SCOPE');
  });

  it('200 : état de l’abonnement de l’espace actif', async () => {
    const res = makeRes();
    await billingHandler(makeReq({ query: { id: TENANT_A } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe('discovery');
    expect(Array.isArray(res.body.catalog)).toBe(true);
    expect(res.body.payments).toEqual([]);
  });
});

describe('GET /api/admin/tenants/[id]/domain', () => {
  it('200 sans domaine : aucun enregistrement DNS', async () => {
    const res = makeRes();
    await domainHandler(makeReq({ query: { id: TENANT_A } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ domain: null, records: [] });
  });

  it('404 UNKNOWN_TENANT', async () => {
    const res = makeRes();
    await domainHandler(makeReq({ query: { id: UNKNOWN } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('UNKNOWN_TENANT');
  });
});

describe('/api/admin/tenants/[id]/api-tokens', () => {
  it('POST 201 : clair rendu une fois, jamais mis en cache d’idempotence', async () => {
    const res = makeRes();
    const req = makeReq({
      method: 'POST',
      query: { id: TENANT_B },
      body: { name: 'Partenaire', scopes: ['tournaments:read'] },
    });
    req.headers['idempotency-key'] = 'k-mint-1';
    await tenantTokensHandler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.token).toMatch(/^pk_live_/);
    const row = (store.tenant_api_tokens ?? [])[0] as any;
    expect(row.tenant_id).toBe(TENANT_B);
    expect(row.token_hash).not.toBe(res.body.token);
    expect(store.admin_idempotency ?? []).toEqual([]);
    // Journal précis (plus `other`), sans clair ni empreinte.
    const log = (store.staff_logs ?? []).find(
      (l: any) => l.action === 'create_api_token'
    ) as any;
    expect(log?.tenant_id).toBe(TENANT_B);
    expect(JSON.stringify(log)).not.toContain(res.body.token);
    expect(JSON.stringify(log)).not.toContain(row.token_hash);
  });

  it('GET : métadonnées seules — aucune colonne secrète lue', async () => {
    store.tenant_api_tokens = [
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        tenant_id: TENANT_B,
        name: 'k',
        token_prefix: 'pk_live_abc123',
        token_hash: 'secret-hash',
        scopes: [],
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await tenantTokensHandler(makeReq({ query: { id: TENANT_B } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.tokens).toHaveLength(1);
    // Le mock ne projette pas les colonnes : la garantie est la liste lue.
    for (const cols of [
      API_TOKEN_LIST_COLUMNS,
      TENANT_API_TOKEN_LIST_COLUMNS,
      WEBHOOK_LIST_COLUMNS,
      WEBHOOK_CREATED_COLUMNS,
      TENANT_REQUEST_COLUMNS,
      TENANT_DETAIL_COLUMNS,
    ]) {
      expect(cols).not.toMatch(
        /token_hash|\bsecret\b|_token\b|verification_token/
      );
    }
  });

  it('DELETE : 404 TOKEN_NOT_FOUND pour une clé d’un AUTRE espace', async () => {
    store.tenant_api_tokens = [
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        tenant_id: TENANT_A,
        name: 'k',
        token_prefix: 'pk_live_abc123',
        revoked_at: null,
      },
    ] as any;
    const res = makeRes();
    await tenantTokensHandler(
      makeReq({
        method: 'DELETE',
        query: {
          id: TENANT_B,
          tokenId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('TOKEN_NOT_FOUND');
  });

  it('DELETE : 400 INVALID_TOKEN_ID', async () => {
    const res = makeRes();
    await tenantTokensHandler(
      makeReq({ method: 'DELETE', query: { id: TENANT_B, tokenId: 'x' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN_ID');
  });
});

describe('GET /api/admin/webhooks/[id]/deliveries', () => {
  it('404 NOT_FOUND pour un abonnement d’un autre espace', async () => {
    store.webhook_subscriptions = [{ id: SUB_B, tenant_id: TENANT_B }] as any;
    const res = makeRes();
    await deliveriesHandler(makeReq({ query: { id: SUB_B } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('200 : livraisons de l’abonnement de l’espace actif', async () => {
    store.webhook_subscriptions = [{ id: SUB_A, tenant_id: TENANT_A }] as any;
    store.webhook_deliveries = [
      {
        id: 'd1',
        subscription_id: SUB_A,
        event_name: 'match.finished',
        status: 'delivered',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await deliveriesHandler(makeReq({ query: { id: SUB_A } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.deliveries).toHaveLength(1);
  });

  it('400 INVALID_ID', async () => {
    const res = makeRes();
    await deliveriesHandler(makeReq({ query: { id: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });
});

describe('POST /api/admin/tenants/[id]/rotate-secrets', () => {
  it('les secrets en clair ne sont jamais mis en cache d’idempotence', async () => {
    const res = makeRes();
    const req = makeReq({ method: 'POST', query: { id: TENANT_A } });
    req.headers['idempotency-key'] = 'k-rotate-1';
    await rotateHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.botApiKey).toMatch(/^[0-9a-f]{64}$/);
    expect(store.admin_idempotency ?? []).toEqual([]);
    const log = (store.staff_logs ?? []).find(
      (l: any) => l.action === 'rotate_bot_secrets'
    );
    expect(JSON.stringify(log)).not.toContain(res.body.botApiKey);
    expect(JSON.stringify(log)).not.toContain(res.body.botWebhookSecret);
  });
});
