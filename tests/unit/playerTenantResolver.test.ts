// tests/unit/playerTenantResolver.test.ts
//
// Le résolveur d'espace des requêtes JOUEUSE (utils/tenant.ts,
// `resolvePlayerTenant`) — lot 10, isolation des espaces.
//
// CE QUE CES CAS PROTÈGENT, dans l'ordre de la règle :
//
//   1. ÉQUIPE ACTIVE (`?teamId=`) : retenue si la joueuse en est membre ou
//      capitaine, IGNORÉE sinon — un paramètre d'URL n'est pas une preuve.
//   2. DOMAINE PROPRE : retenu, et SEUL signal de requête à cette étape — ni le
//      `?tenant=` ni le préfixe de chemin du résolveur public, et pas de repli
//      sur l'espace par défaut sur owwomenscup.fr.
//   3. APPARTENANCE STABLE : la plus ancienne, puis `tenant_id`. L'ancienne
//      version lisait `.limit(1)` sans ordre ; on sème donc les lignes dans
//      l'ordre INVERSE de l'ancienneté, pour qu'un `.limit(1)` naïf échoue.
//   4. DÉFAUT.
//
// Plus : mémo par requête (une lecture, même résolue trois fois), erreurs de
// lecture qui LÈVENT au lieu d'attribuer l'espace par défaut, et la préférence
// d'espace utilisée par l'inspection staff. Le cas `?as=` de bout en bout est
// dans tests/unit/subjectResolution.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fromCalls,
  resetSupabaseMock,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  DEFAULT_TENANT_ID,
  TenantResolutionError,
  __resetTenantSlugCacheForTests,
  resolvePlayerTenant,
  resolveTenantIdForUserRequestAsync,
} from '../../utils/tenant';
import * as tenantModule from '../../utils/tenant';

const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const TEAM_DEFAULT = 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0';
const TEAM_B = 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0';
const TEAM_C = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';

type Req = {
  headers: Record<string, string>;
  query?: Record<string, string>;
  url?: string;
};

function req(over: Partial<Req> = {}): Req {
  return {
    headers: { host: 'owwomenscup.fr' },
    query: {},
    url: '/api/player/dashboard',
    ...over,
  };
}

function seedTenants() {
  store.tenants = [
    { id: DEFAULT_TENANT_ID, slug: 'conference', is_active: true },
    {
      id: TENANT_B,
      slug: 'beta',
      is_active: true,
      custom_domain: 'ligue-beta.fr',
      custom_domain_state: 'verified',
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
    { id: TENANT_C, slug: 'gamma', is_active: true },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  __resetTenantSlugCacheForTests();
  seedTenants();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('étape 1 — équipe active', () => {
  it('retient l’espace de l’équipe dont la joueuse est membre', async () => {
    store.team_members = [
      // Plus ancienne appartenance : dans l'espace par défaut. Sans l'étape 1,
      // c'est elle qui gagnerait.
      {
        team_id: TEAM_DEFAULT,
        user_id: PLAYER,
        tenant_id: DEFAULT_TENANT_ID,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        team_id: TEAM_B,
        user_id: PLAYER,
        tenant_id: TENANT_B,
        created_at: '2026-09-01T00:00:00Z',
      },
    ];
    const r = await resolvePlayerTenant(req({ query: { teamId: TEAM_B } }), {
      authUserId: PLAYER,
    });
    expect(r).toEqual({ tenantId: TENANT_B, source: 'active_team' });
  });

  it('retient l’équipe dont la joueuse est capitaine sans ligne membre', async () => {
    store.team_members = [];
    store.teams = [{ id: TEAM_C, tenant_id: TENANT_C, captain_id: PLAYER }];
    const r = await resolvePlayerTenant(req({ query: { teamId: TEAM_C } }), {
      authUserId: PLAYER,
    });
    expect(r).toEqual({ tenantId: TENANT_C, source: 'active_team' });
  });

  it('IGNORE une équipe dont la joueuse n’est ni membre ni capitaine', async () => {
    // L'équipe existe, dans un autre espace, et quelqu'un d'autre la mène.
    store.teams = [{ id: TEAM_B, tenant_id: TENANT_B, captain_id: OTHER }];
    store.team_members = [
      {
        team_id: TEAM_B,
        user_id: OTHER,
        tenant_id: TENANT_B,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        team_id: TEAM_DEFAULT,
        user_id: PLAYER,
        tenant_id: DEFAULT_TENANT_ID,
        created_at: '2026-02-01T00:00:00Z',
      },
    ];
    const r = await resolvePlayerTenant(req({ query: { teamId: TEAM_B } }), {
      authUserId: PLAYER,
    });
    expect(r).toEqual({ tenantId: DEFAULT_TENANT_ID, source: 'membership' });
  });

  it('ignore une valeur qui n’est pas un UUID', async () => {
    store.team_members = [];
    const r = await resolvePlayerTenant(
      req({ query: { teamId: `${TEAM_B}' or 1=1` } }),
      { authUserId: PLAYER }
    );
    expect(r).toEqual({ tenantId: DEFAULT_TENANT_ID, source: 'default' });
  });

  it('lit `?teamId=` dans l’URL brute quand la requête n’a pas de `query` (SSR)', async () => {
    store.team_members = [
      {
        team_id: TEAM_B,
        user_id: PLAYER,
        tenant_id: TENANT_B,
        created_at: '2026-09-01T00:00:00Z',
      },
    ];
    const r = await resolvePlayerTenant(
      {
        headers: { host: 'owwomenscup.fr' },
        url: `/team/x/edit?teamId=${TEAM_B}`,
      },
      { authUserId: PLAYER }
    );
    expect(r).toEqual({ tenantId: TENANT_B, source: 'active_team' });
  });

  it('l’emporte sur le domaine propre', async () => {
    store.team_members = [
      {
        team_id: TEAM_C,
        user_id: PLAYER,
        tenant_id: TENANT_C,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const r = await resolvePlayerTenant(
      req({ headers: { host: 'ligue-beta.fr' }, query: { teamId: TEAM_C } }),
      { authUserId: PLAYER }
    );
    expect(r).toEqual({ tenantId: TENANT_C, source: 'active_team' });
  });
});

describe('étape 2 — domaine propre', () => {
  it('retient l’espace du domaine propre, avant l’appartenance', async () => {
    store.team_members = [
      {
        team_id: TEAM_DEFAULT,
        user_id: PLAYER,
        tenant_id: DEFAULT_TENANT_ID,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const r = await resolvePlayerTenant(
      req({ headers: { host: 'ligue-beta.fr' } }),
      { authUserId: PLAYER }
    );
    expect(r).toEqual({ tenantId: TENANT_B, source: 'custom_domain' });
  });

  it('ne lit pas les appartenances quand le domaine suffit', async () => {
    await resolvePlayerTenant(req({ headers: { host: 'ligue-beta.fr' } }), {
      authUserId: PLAYER,
    });
    expect(fromCalls).not.toContain('team_members');
  });

  it('un domaine NON vérifié ne route pas', async () => {
    (store.tenants as Record<string, unknown>[])[1].custom_domain_state =
      'pending';
    const r = await resolvePlayerTenant(
      req({ headers: { host: 'ligue-beta.fr' } }),
      { authUserId: PLAYER }
    );
    expect(r.source).toBe('default');
  });

  it('n’honore NI `?tenant=` NI le préfixe de chemin (affirmations du client)', async () => {
    store.team_members = [];
    const viaParam = await resolvePlayerTenant(
      req({
        url: '/api/player/predictions?tenant=beta',
        query: { tenant: 'beta' },
      }),
      { authUserId: PLAYER }
    );
    const viaPrefix = await resolvePlayerTenant(
      { headers: { host: 'owwomenscup.fr' }, url: '/beta/team/x/edit' },
      { authUserId: PLAYER }
    );
    expect(viaParam).toEqual({
      tenantId: DEFAULT_TENANT_ID,
      source: 'default',
    });
    expect(viaPrefix).toEqual({
      tenantId: DEFAULT_TENANT_ID,
      source: 'default',
    });
  });

  it.each([
    'owwomenscup.fr',
    'www.owwomenscup.fr',
    'deploy-preview-42--owwomenscup.netlify.app',
    'localhost:3000',
  ])('hôte de la plateforme %s : aucune lecture des domaines', async (host) => {
    store.team_members = [];
    const r = await resolvePlayerTenant(req({ headers: { host } }), {
      authUserId: PLAYER,
    });
    expect(r.source).toBe('default');
    expect(fromCalls).not.toContain('tenants');
  });
});

describe('étape 3 — appartenance stable', () => {
  /**
   * Semées dans l'ordre INVERSE de l'ancienneté : la première ligne physique
   * est la plus récente. Un `.limit(1)` sans ordre rendrait TENANT_C.
   */
  function seedMultiSpacePlayer() {
    store.team_members = [
      {
        team_id: TEAM_C,
        user_id: PLAYER,
        tenant_id: TENANT_C,
        created_at: '2026-09-10T00:00:00Z',
      },
      {
        team_id: TEAM_B,
        user_id: PLAYER,
        tenant_id: TENANT_B,
        created_at: '2026-03-01T00:00:00Z',
      },
      {
        team_id: TEAM_DEFAULT,
        user_id: OTHER,
        tenant_id: DEFAULT_TENANT_ID,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
  }

  it('retient la plus ancienne appartenance', async () => {
    seedMultiSpacePlayer();
    const r = await resolvePlayerTenant(req(), { authUserId: PLAYER });
    expect(r).toEqual({ tenantId: TENANT_B, source: 'membership' });
  });

  it('50 appels → toujours le même espace', async () => {
    seedMultiSpacePlayer();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      // Un objet requête NEUF à chaque appel : le mémo par requête ne doit pas
      // masquer une instabilité de la lecture.
      const r = await resolvePlayerTenant(req(), { authUserId: PLAYER });
      seen.add(r.tenantId);
    }
    expect([...seen]).toEqual([TENANT_B]);
  });

  it('à ancienneté égale, départage par tenant_id', async () => {
    store.team_members = [
      {
        team_id: TEAM_C,
        user_id: PLAYER,
        tenant_id: TENANT_C,
        created_at: '2026-03-01T00:00:00Z',
      },
      {
        team_id: TEAM_B,
        user_id: PLAYER,
        tenant_id: TENANT_B,
        created_at: '2026-03-01T00:00:00Z',
      },
    ];
    const r = await resolvePlayerTenant(req(), { authUserId: PLAYER });
    expect(r.tenantId).toBe(TENANT_B); // 'bbbb…' < 'cccc…'
  });

  it('préfère l’appartenance dans l’espace demandé (inspection staff)', async () => {
    seedMultiSpacePlayer();
    const r = await resolvePlayerTenant(req(), {
      authUserId: PLAYER,
      preferTenantId: TENANT_C,
    });
    expect(r).toEqual({ tenantId: TENANT_C, source: 'membership' });
  });

  it('une préférence sans appartenance correspondante ne change rien', async () => {
    seedMultiSpacePlayer();
    const r = await resolvePlayerTenant(req(), {
      authUserId: PLAYER,
      preferTenantId: DEFAULT_TENANT_ID,
    });
    expect(r).toEqual({ tenantId: TENANT_B, source: 'membership' });
  });
});

describe('étape 4 — défaut', () => {
  it('aucune appartenance → espace par défaut', async () => {
    store.team_members = [];
    const r = await resolvePlayerTenant(req(), { authUserId: PLAYER });
    expect(r).toEqual({ tenantId: DEFAULT_TENANT_ID, source: 'default' });
  });

  it('lignes sans tenant_id (antérieures à la colonne) → aucun signal', async () => {
    store.team_members = [{ team_id: TEAM_DEFAULT, user_id: PLAYER }];
    const r = await resolvePlayerTenant(req(), { authUserId: PLAYER });
    expect(r).toEqual({ tenantId: DEFAULT_TENANT_ID, source: 'default' });
  });

  it('sans joueuse identifiée → défaut, sans lecture', async () => {
    const r = await resolvePlayerTenant(req({ query: { teamId: TEAM_B } }), {
      authUserId: null,
    });
    expect(r).toEqual({ tenantId: DEFAULT_TENANT_ID, source: 'default' });
    expect(fromCalls).toEqual([]);
  });
});

describe('mémo par requête', () => {
  it('trois résolutions de la même requête → une seule lecture', async () => {
    store.team_members = [];
    const same = req({ query: { teamId: TEAM_B } });
    await resolvePlayerTenant(same, { authUserId: PLAYER });
    await resolveTenantIdForUserRequestAsync(same, { authUserId: PLAYER });
    await resolvePlayerTenant(same, { authUserId: PLAYER });
    expect(fromCalls.filter((t) => t === 'team_members')).toHaveLength(1);
    // + la lecture capitaine de l'étape 1, une fois aussi.
    expect(fromCalls.filter((t) => t === 'teams')).toHaveLength(1);
  });

  it('ne survit pas à la requête : une nouvelle requête relit', async () => {
    store.team_members = [
      {
        team_id: TEAM_B,
        user_id: PLAYER,
        tenant_id: TENANT_B,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    expect(
      (await resolvePlayerTenant(req(), { authUserId: PLAYER })).tenantId
    ).toBe(TENANT_B);
    // La joueuse change d'équipe entre deux appels.
    store.team_members = [];
    expect(
      (await resolvePlayerTenant(req(), { authUserId: PLAYER })).tenantId
    ).toBe(DEFAULT_TENANT_ID);
  });

  it('distingue la joueuse résolue au sein d’une même requête (inspection)', async () => {
    store.team_members = [
      {
        team_id: TEAM_B,
        user_id: OTHER,
        tenant_id: TENANT_B,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const same = req();
    expect(
      (await resolvePlayerTenant(same, { authUserId: PLAYER })).tenantId
    ).toBe(DEFAULT_TENANT_ID);
    expect(
      (await resolvePlayerTenant(same, { authUserId: OTHER })).tenantId
    ).toBe(TENANT_B);
  });
});

describe('lecture impossible → erreur, jamais l’espace par défaut', () => {
  /** Une chaîne PostgREST dont toute lecture échoue. */
  function failingChain() {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'not', 'limit']) {
      chain[m] = () => chain;
    }
    const result = { data: null, error: { message: 'boom' } };
    chain.maybeSingle = () => Promise.resolve(result);
    // Awaitable comme un builder PostgREST.
    chain.then = (ok: (r: unknown) => unknown) =>
      Promise.resolve(result).then(ok);
    return chain;
  }

  it('appartenances illisibles', async () => {
    vi.spyOn(supabaseAdmin, 'from').mockReturnValue(failingChain() as never);
    await expect(
      resolvePlayerTenant(req(), { authUserId: PLAYER })
    ).rejects.toBeInstanceOf(TenantResolutionError);
    await expect(
      resolveTenantIdForUserRequestAsync(req(), { authUserId: PLAYER })
    ).rejects.toThrow(/membership/);
  });

  it('domaines propres illisibles (hôte étranger)', async () => {
    vi.spyOn(supabaseAdmin, 'from').mockReturnValue(failingChain() as never);
    await expect(
      resolvePlayerTenant(req({ headers: { host: 'ligue-beta.fr' } }), {
        authUserId: PLAYER,
      })
    ).rejects.toThrow(/custom_domain/);
  });

  it('équipe active illisible', async () => {
    store.team_members = [];
    const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(((table: string) =>
      table === 'teams' ? failingChain() : realFrom(table)) as never);
    await expect(
      resolvePlayerTenant(req({ query: { teamId: TEAM_B } }), {
        authUserId: PLAYER,
      })
    ).rejects.toThrow(/active_team/);
  });
});

describe('surface du module', () => {
  it('le résolveur synchrone a disparu', () => {
    // Il rendait toujours l'espace par défaut : le réintroduire rouvrirait la
    // fuite entre espaces sans qu'aucun test de route ne le voie.
    expect('resolveTenantIdForUserRequest' in tenantModule).toBe(false);
  });
});
