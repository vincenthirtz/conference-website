// tests/unit/tenantResolverPathPrefix.test.ts
//
// Multi-tenant POC — path-prefix resolver (S7a).
//
// Couvre `getTenantIdBySlug` (lookup DB + cache 60s) et
// `resolveTenantIdForPublicRequestAsync` (extraction slug depuis `req.url`).
//
// On utilise le mock partagé `supabaseAdmin` du testSetup pour seeder la
// table `tenants` et observer le nombre de `from('tenants')` appelés (le
// helper expose `fromCalls`).

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  resetSupabaseMock,
  store,
  fromCalls,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  DEFAULT_TENANT_ID,
  __resetTenantSlugCacheForTests,
  getTenantIdBySlug,
  resolveTenantIdForPublicRequestAsync,
  resolveTenantIdForUserRequestAsync,
} from '../../utils/tenant';

const CONFERENCE_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const ESPORT_CLUB_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function seedTenants() {
  store['tenants'] = [
    {
      id: CONFERENCE_ID,
      slug: 'conference',
      name: 'Conference',
      is_active: true,
    },
    {
      id: ESPORT_CLUB_ID,
      slug: 'esport-club',
      name: 'Esport Club',
      is_active: true,
    },
    {
      id: '99999999-9999-4999-8999-999999999999',
      slug: 'archived-tenant',
      name: 'Archived',
      is_active: false,
    },
  ];
}

function makeReq(url: string): { url: string; headers: Record<string, never> } {
  return { url, headers: {} };
}

beforeEach(() => {
  resetSupabaseMock();
  __resetTenantSlugCacheForTests();
  seedTenants();
});

/* ---------------------------------------------------------------------------
 * getTenantIdBySlug — DB lookup + cache
 * ------------------------------------------------------------------------- */

describe('getTenantIdBySlug()', () => {
  it('returns the tenant.id for a known active slug', async () => {
    const id = await getTenantIdBySlug('conference');
    expect(id).toBe(CONFERENCE_ID);
  });

  it('resolves a second slug independently', async () => {
    const id = await getTenantIdBySlug('esport-club');
    expect(id).toBe(ESPORT_CLUB_ID);
  });

  it('returns null for an unknown slug', async () => {
    const id = await getTenantIdBySlug('does-not-exist');
    expect(id).toBeNull();
  });

  it('returns null for an inactive tenant', async () => {
    const id = await getTenantIdBySlug('archived-tenant');
    expect(id).toBeNull();
  });

  it('returns null for a malformed slug (regex reject)', async () => {
    const id = await getTenantIdBySlug('Has Spaces');
    expect(id).toBeNull();
    // No DB hit — rejected before lookup.
    expect(
      fromCalls.filter((t) => t === 'tenants').length,
      'should not query DB for malformed slugs'
    ).toBe(0);
  });

  it('returns null for an empty slug', async () => {
    const id = await getTenantIdBySlug('');
    expect(id).toBeNull();
  });

  it('caches a hit — second call does not re-query the DB', async () => {
    const first = await getTenantIdBySlug('conference');
    const second = await getTenantIdBySlug('conference');
    expect(first).toBe(CONFERENCE_ID);
    expect(second).toBe(CONFERENCE_ID);

    const dbCalls = fromCalls.filter((t) => t === 'tenants').length;
    expect(dbCalls).toBe(1);
  });

  it('caches a miss — negative cache prevents repeated DB hits', async () => {
    const first = await getTenantIdBySlug('ghost');
    const second = await getTenantIdBySlug('ghost');
    expect(first).toBeNull();
    expect(second).toBeNull();

    const dbCalls = fromCalls.filter((t) => t === 'tenants').length;
    expect(dbCalls).toBe(1);
  });

  it('distinct slugs each trigger their own DB hit', async () => {
    await getTenantIdBySlug('conference');
    await getTenantIdBySlug('esport-club');

    const dbCalls = fromCalls.filter((t) => t === 'tenants').length;
    expect(dbCalls).toBe(2);
  });
});

/* ---------------------------------------------------------------------------
 * resolveTenantIdForPublicRequestAsync — full path-prefix resolution
 * ------------------------------------------------------------------------- */

describe('resolveTenantIdForPublicRequestAsync()', () => {
  it('returns tenant.id when path starts with a known slug', async () => {
    const req = makeReq('/conference/tournois');
    const id = await resolveTenantIdForPublicRequestAsync(req);
    expect(id).toBe(CONFERENCE_ID);
  });

  it('handles deep paths under a tenant prefix', async () => {
    const req = makeReq('/esport-club/team/some-slug/maps');
    const id = await resolveTenantIdForPublicRequestAsync(req);
    expect(id).toBe(ESPORT_CLUB_ID);
  });

  it('strips query string before extracting the slug', async () => {
    const req = makeReq('/conference/tournois?foo=bar&baz=42');
    const id = await resolveTenantIdForPublicRequestAsync(req);
    expect(id).toBe(CONFERENCE_ID);
  });

  it('falls back to DEFAULT_TENANT_ID when path has no prefix (legacy /tournois)', async () => {
    const req = makeReq('/tournois');
    const id = await resolveTenantIdForPublicRequestAsync(req);
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('falls back to DEFAULT_TENANT_ID for unknown slug (page will 404 via getTenantIdBySlug)', async () => {
    const req = makeReq('/ghost-tenant/tournois');
    const id = await resolveTenantIdForPublicRequestAsync(req);
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('falls back to DEFAULT_TENANT_ID for root path "/"', async () => {
    const req = makeReq('/');
    const id = await resolveTenantIdForPublicRequestAsync(req);
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('falls back to DEFAULT_TENANT_ID for reserved path segments (/api, /_next, /admin, /auth)', async () => {
    for (const seg of ['/api/foo', '/_next/static', '/admin/dashboard', '/auth/login']) {
      const id = await resolveTenantIdForPublicRequestAsync(makeReq(seg));
      expect(id, `segment "${seg}" should fall back`).toBe(DEFAULT_TENANT_ID);
    }
  });

  it('falls back when req.url is missing', async () => {
    const id = await resolveTenantIdForPublicRequestAsync({
      headers: {},
    } as never);
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('cache hit: 2 consecutive calls on the same slug → 1 DB lookup', async () => {
    const reqA = makeReq('/conference/tournois');
    const reqB = makeReq('/conference/team/blue');

    await resolveTenantIdForPublicRequestAsync(reqA);
    await resolveTenantIdForPublicRequestAsync(reqB);

    const dbCalls = fromCalls.filter((t) => t === 'tenants').length;
    expect(dbCalls).toBe(1);
  });

  it('inactive tenant → fallback (and 404 logic owned by page-level getTenantIdBySlug)', async () => {
    const req = makeReq('/archived-tenant/tournois');
    const id = await resolveTenantIdForPublicRequestAsync(req);
    expect(id).toBe(DEFAULT_TENANT_ID);
  });
});

/* ---------------------------------------------------------------------------
 * resolveTenantIdForUserRequestAsync — membership-based user-level resolution
 * ------------------------------------------------------------------------- */

describe('resolveTenantIdForUserRequestAsync()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the tenant of the user membership when found', async () => {
    seedTenants();
    store['team_members'] = [
      { id: 'm1', user_id: 'user-1', tenant_id: ESPORT_CLUB_ID },
    ];
    const id = await resolveTenantIdForUserRequestAsync(makeReq('/tournois'), {
      authUserId: 'user-1',
    });
    expect(id).toBe(ESPORT_CLUB_ID);
  });

  it('falls back to DEFAULT_TENANT_ID when the user has no membership', async () => {
    store['team_members'] = [];
    const id = await resolveTenantIdForUserRequestAsync(makeReq('/tournois'), {
      authUserId: 'user-without-team',
    });
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('falls back to DEFAULT_TENANT_ID when no authUserId is provided', async () => {
    const id = await resolveTenantIdForUserRequestAsync(makeReq('/tournois'), {
      authUserId: null,
    });
    expect(id).toBe(DEFAULT_TENANT_ID);
  });

  it('falls back to DEFAULT_TENANT_ID on a DB error (never throws)', async () => {
    vi.spyOn(supabaseAdmin, 'from').mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: null,
                error: { message: 'boom' },
              }),
          }),
        }),
      }),
    } as never);
    const id = await resolveTenantIdForUserRequestAsync(makeReq('/tournois'), {
      authUserId: 'user-1',
    });
    expect(id).toBe(DEFAULT_TENANT_ID);
  });
});
