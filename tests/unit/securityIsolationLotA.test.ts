// Régressions de sécurité — lot A (isolation entre espaces / escalade).
//
// Défauts PRÉEXISTANTS signalés pendant les vagues serveur 3-4
// (docs/PLAN-industrialisation-admin.md) et corrigés ensemble. Règle posée par
// 8467a881 : on n'agit que dans son espace (membre `tenant_staff`) ou en
// pôle-admin ; un owner EFFECTIF (élevé par `tenant_staff`, compte
// développeur compris) n'obtient jamais un privilège de PLATEFORME.
//
// Pour chaque point : un cas refusé (autre espace / escalade), rien d'écrit ;
// un cas autorisé, identique à avant.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { broadcasterTokenMock } = vi.hoisted(() => ({
  broadcasterTokenMock: vi.fn(),
}));
vi.mock('@/utils/twitchBroadcaster', async (orig) => ({
  ...(await orig<typeof import('../../utils/twitchBroadcaster')>()),
  getValidBroadcasterToken: broadcasterTokenMock,
}));
vi.mock('@/utils/twitch', async (orig) => ({
  ...(await orig<typeof import('../../utils/twitch')>()),
  getAccessToken: vi.fn(async () => 'app-token'),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import type { ServiceContext } from '../../utils/admin/serviceContext';

import poleAdminToggle from '../../pages/api/admin/staff/[staffId]/pole-admin';
import permissionsHandler from '../../pages/api/admin/users/[userId]/permissions';
import usersManageHandler from '../../pages/api/admin/users/manage';
import recycleBinHandler from '../../pages/api/admin/recycle-bin';
import apiTokensHandler from '../../pages/api/admin/api-tokens/index';

import { restoreFromRecycleBin } from '../../features/admin/recycle-bin/service';
import {
  createTournamentTemplate,
  deleteTournamentTemplate,
  listTournamentTemplates,
} from '../../features/admin/tournaments/service/templates';
import { importTeamsFromPlatform } from '../../features/admin/teams/service/imports';
import {
  bulkTeams,
  updateTeam,
} from '../../features/admin/teams/service/teams';
import { updateTeamAvailability } from '../../features/admin/teams/service/availability';
import { subscribeTcgDrop } from '../../features/admin/twitch/service/eventsub';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ME = '55555555-5555-4555-8555-555555555555';
const OTHER = '99999999-9999-4999-8999-999999999999';
const TEAM_A = '11111111-1111-4111-8111-111111111111';
const TEAM_B = '22222222-2222-4222-8222-222222222222';
const TOURN_A = '33333333-3333-4333-8333-333333333333';
const TOURN_B = '44444444-4444-4444-8444-444444444444';
const USER_MEMBER = '66666666-6666-4666-8666-666666666666';
const USER_STRANGER = '77777777-7777-4777-8777-777777777777';
const CONSTRAINT = '88888888-8888-4888-8888-888888888888';
const CARD_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CARD_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Row = Record<string, unknown>;

function staffRow(
  id: string,
  authUserId: string,
  role: StaffMember['role'],
  isPoleAdmin = false
): StaffMember {
  return {
    id,
    auth_user_id: authUserId,
    email: `${authUserId}@x.test`,
    role,
    display_name: authUserId,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: isPoleAdmin,
    is_active: true,
  } as StaffMember;
}

/**
 * Appelant = `ME`. `tenantRole` : rattachement `tenant_staff` à TENANT_A
 * (élévation EFFECTIVE). Compte développeur = global `caster` + owner
 * d'espace.
 */
function seedCaller(
  globalRole: StaffMember['role'],
  opts: { tenantRole?: StaffMember['role']; poleAdmin?: boolean } = {}
) {
  store.staff = [
    staffRow(ME, 'user-me', globalRole, opts.poleAdmin),
    staffRow(OTHER, 'user-other', 'caster'),
  ] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'a', name: 'A', is_active: true },
    { id: TENANT_B, slug: 'b', name: 'B', is_active: true },
  ] as any;
  store.tenant_staff = opts.tenantRole
    ? ([{ tenant_id: TENANT_A, staff_id: ME, role: opts.tenantRole }] as any)
    : ([] as any);
  invalidateStaffCache();
  invalidateTenantAccessCache();
}

const devAccount = () => seedCaller('caster', { tenantRole: 'owner' });

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-lot-a-${n}` },
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

const logger = { error() {}, warn() {}, info() {}, debug() {} } as any;
function svc(tenantId: string): ServiceContext {
  return {
    db: supabaseAdmin as any,
    tenantId,
    actor: { kind: 'staff', staffId: ME, userId: 'user-me' },
    logger,
  };
}

async function rejects(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    return err as { status?: number; message: string; code?: string };
  }
  throw new Error('attendu : refus');
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: 'user-me' });
  seedCaller('owner');
});

/* 1. staff/[staffId]/pole-admin (+ users/*) ------------------------------ */

describe('1. pole-admin : owner GLOBAL exigé, pas d’auto-promotion', () => {
  it('refusé : un compte développeur (owner d’espace) ne se passe pas pôle-admin', async () => {
    devAccount();
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'POST', query: { staffId: ME } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((store.staff as Row[]).find((s) => s.id === ME)!.is_pole_admin).toBe(
      false
    );
  });

  it('refusé : un owner global non pôle-admin ne s’auto-promeut pas', async () => {
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'POST', query: { staffId: ME } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('SELF_POLE_ADMIN');
    expect((store.staff as Row[]).find((s) => s.id === ME)!.is_pole_admin).toBe(
      false
    );
  });

  it('autorisé : un owner global promeut un autre staff', async () => {
    const res = makeRes();
    await poleAdminToggle(
      makeReq({ method: 'POST', query: { staffId: OTHER } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.staff as Row[]).find((s) => s.id === OTHER)!.is_pole_admin
    ).toBe(true);
  });

  it('refusé : un compte développeur ne s’accorde pas de permission globale', async () => {
    devAccount();
    const res = makeRes();
    await permissionsHandler(
      makeReq({
        method: 'PUT',
        query: { userId: 'user-me' },
        body: { extraPermissions: ['manage_tenant'] },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(
      (store.staff as Row[]).find((s) => s.id === ME)!.extra_permissions
    ).toBeUndefined();
  });

  it('refusé : un compte développeur ne change pas un rôle staff global', async () => {
    devAccount();
    const res = makeRes();
    await usersManageHandler(
      makeReq({
        method: 'PATCH',
        body: { userId: 'user-other', role: 'helper' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((store.staff as Row[]).find((s) => s.id === OTHER)!.role).toBe(
      'caster'
    );
  });

  it('autorisé : un owner global accorde une permission', async () => {
    const res = makeRes();
    await permissionsHandler(
      makeReq({
        method: 'PUT',
        query: { userId: 'user-other' },
        body: { extraPermissions: ['manage_teams'] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.staff as Row[]).find((s) => s.id === OTHER)!.extra_permissions
    ).toEqual(['manage_teams']);
  });
});

/* 2. recycle-bin ---------------------------------------------------------- */

describe('2. recycle-bin : sources globales réservées à la plateforme', () => {
  beforeEach(() => {
    (store.staff as Row[]).push({
      ...staffRow(USER_STRANGER, 'user-gone', 'admin'),
      is_active: false,
      deleted_at: '2026-09-01T00:00:00.000Z',
    });
    store.teams = [
      {
        id: TEAM_A,
        tenant_id: TENANT_A,
        name: 'A',
        is_active: false,
        deleted_at: '2026-09-01T00:00:00.000Z',
      },
    ] as any;
  });

  it('refusé : un admin d’espace ne restaure pas un compte staff', async () => {
    seedCaller('admin', { tenantRole: 'admin' });
    (store.staff as Row[]).push({
      ...staffRow(USER_STRANGER, 'user-gone', 'admin'),
      is_active: false,
      deleted_at: '2026-09-01T00:00:00.000Z',
    });
    const res = makeRes();
    await recycleBinHandler(
      makeReq({ method: 'PATCH', body: { id: USER_STRANGER, type: 'staff' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(
      (store.staff as Row[]).find((s) => s.id === USER_STRANGER)!.is_active
    ).toBe(false);

    const list = makeRes();
    await recycleBinHandler(makeReq({ query: { type: 'staff' } }), list);
    expect(list.statusCode).toBe(403);
  });

  it('refusé : la liste « tous types » d’un admin d’espace omet les sources globales', async () => {
    seedCaller('admin', { tenantRole: 'admin' });
    (store.staff as Row[]).push({
      ...staffRow(USER_STRANGER, 'user-gone', 'admin'),
      is_active: false,
      deleted_at: '2026-09-01T00:00:00.000Z',
    });
    const res = makeRes();
    await recycleBinHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const types = (res.body.items as Row[]).map((i) => i.type);
    expect(types).toContain('team');
    expect(types).not.toContain('staff');
  });

  it('autorisé : un admin d’espace restaure une équipe de son espace', async () => {
    seedCaller('admin', { tenantRole: 'admin' });
    store.teams = [
      {
        id: TEAM_A,
        tenant_id: TENANT_A,
        name: 'A',
        is_active: false,
        deleted_at: '2026-09-01T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({ method: 'PATCH', body: { id: TEAM_A, type: 'team' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams as Row[])[0].deleted_at).toBeNull();
  });

  it('autorisé : un owner global restaure un compte staff', async () => {
    const res = makeRes();
    await recycleBinHandler(
      makeReq({ method: 'PATCH', body: { id: USER_STRANGER, type: 'staff' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.staff as Row[]).find((s) => s.id === USER_STRANGER)!.is_active
    ).toBe(true);
  });

  it('500 : jamais le message brut de la base', async () => {
    const failing = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: async () => ({
              error: { message: 'relation "teams" secret detail' },
            }),
          }),
        }),
      }),
    };
    const err = await rejects(
      restoreFromRecycleBin(
        { ...svc(TENANT_A), db: failing as any },
        { platform: false },
        { id: TEAM_A, type: 'team' }
      )
    );
    expect(err.message).toBe('Failed to restore item');
  });
});

/* 3. tournament-templates ------------------------------------------------- */

describe('3. tournament-templates : modèles par espace, partagés en lecture', () => {
  const shared = { id: 'custom-shared', name: 'Partagé', stages: [] };
  beforeEach(() => {
    store.site_settings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        key: 'custom_tournament_templates',
        value: JSON.stringify([shared]),
      },
    ] as any;
  });
  const defaultBlob = () =>
    (store.site_settings as Row[]).find(
      (r) => r.tenant_id === DEFAULT_TENANT_ID
    )!.value;

  it('refusé : un espace ne supprime pas un modèle partagé', async () => {
    const err = await rejects(
      deleteTournamentTemplate(svc(TENANT_B), { templateId: shared.id })
    );
    expect(err.status).toBe(403);
    expect(defaultBlob()).toBe(JSON.stringify([shared]));
  });

  it('refusé : la création atterrit chez l’espace, pas dans le partagé', async () => {
    await createTournamentTemplate(svc(TENANT_B), {
      name: 'Mien',
      stages: [{ name: 'Poules', stage_type: 'group' }],
    });
    expect(defaultBlob()).toBe(JSON.stringify([shared]));
    const own = (store.site_settings as Row[]).find(
      (r) => r.tenant_id === TENANT_B
    );
    expect(JSON.parse(own!.value as string)[0].name).toBe('Mien');
  });

  it('autorisé : l’espace lit les siens + les partagés (marqués)', async () => {
    await createTournamentTemplate(svc(TENANT_B), {
      name: 'Mien',
      stages: [{ name: 'Poules', stage_type: 'group' }],
    });
    const { templates } = await listTournamentTemplates(svc(TENANT_B));
    expect(templates.map((t) => t.name)).toEqual(['Mien', 'Partagé']);
    expect((templates[1] as Row).shared).toBe(true);
  });

  it('autorisé : le pôle-admin supprime un modèle partagé', async () => {
    await deleteTournamentTemplate(
      svc(TENANT_B),
      { templateId: shared.id },
      { isPoleAdmin: true }
    );
    expect(defaultBlob()).toBe('[]');
  });
});

/* 4. teams/import-platform ------------------------------------------------ */

describe('4. import-platform : clé API de l’espace du staff', () => {
  it('refusé : la clé du tenant par défaut ne sert plus aux autres espaces', async () => {
    store.site_settings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        key: 'challonge_api_key',
        value: 'association-key',
      },
    ] as any;
    const err = await rejects(
      importTeamsFromPlatform(svc(TENANT_B), {
        source: 'challonge',
        sourceRef: 'mon-tournoi',
      })
    );
    expect(err.status).toBe(400);
    expect(err.message).toContain('Clé API non configurée');
  });

  it('autorisé : la clé de l’espace est utilisée', async () => {
    store.site_settings = [
      { tenant_id: TENANT_B, key: 'challonge_api_key', value: 'key-b' },
    ] as any;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const out = await importTeamsFromPlatform(svc(TENANT_B), {
        source: 'challonge',
        sourceRef: 'mon-tournoi',
      }).catch((e: Error) => e);
      expect(String((out as Error).message ?? '')).not.toContain(
        'Clé API non configurée'
      );
      expect(JSON.stringify(fetchMock.mock.calls)).toContain('key-b');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/* 5-7. équipes ------------------------------------------------------------ */

function seedTeams() {
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT_A, name: 'A', captain_id: null },
    { id: TEAM_B, tenant_id: TENANT_B, name: 'B', captain_id: null },
  ] as any;
  store.tournaments = [
    { id: TOURN_A, tenant_id: TENANT_A },
    { id: TOURN_B, tenant_id: TENANT_B },
  ] as any;
  store.tournament_teams = [] as any;
}

describe('5. teams/bulk assign : équipes de l’espace seulement', () => {
  beforeEach(seedTeams);

  it('refusé : une équipe d’un autre espace → 404, rien d’inscrit', async () => {
    const err = await rejects(
      bulkTeams(svc(TENANT_A), {
        action: 'assign',
        teamIds: [TEAM_A, TEAM_B],
        tournamentId: TOURN_A,
      })
    );
    expect(err.status).toBe(404);
    expect(store.tournament_teams).toEqual([]);
  });

  it('autorisé : équipes de l’espace inscrites', async () => {
    const out = await bulkTeams(svc(TENANT_A), {
      action: 'assign',
      teamIds: [TEAM_A],
      tournamentId: TOURN_A,
    });
    expect(out.result.count).toBe(1);
    expect((store.tournament_teams as Row[])[0].team_id).toBe(TEAM_A);
  });
});

describe('6. availability PATCH : tournoi recoupé avec l’espace', () => {
  beforeEach(() => {
    seedTeams();
    store.team_availability_constraints = [
      {
        id: CONSTRAINT,
        tenant_id: TENANT_A,
        team_id: TEAM_A,
        tournament_id: null,
        kind: 'weekday',
        weekdays: [1],
        timezone: 'Europe/Paris',
      },
    ] as any;
  });
  const q = { teamId: TEAM_A, id: CONSTRAINT };

  it('refusé : tournoi d’un autre espace → 404, rien d’écrit', async () => {
    const err = await rejects(
      updateTeamAvailability(svc(TENANT_A), q, { tournament_id: TOURN_B })
    );
    expect(err.status).toBe(404);
    expect(
      (store.team_availability_constraints as Row[])[0].tournament_id
    ).toBeNull();
  });

  it('autorisé : tournoi de l’espace', async () => {
    await updateTeamAvailability(svc(TENANT_A), q, { tournament_id: TOURN_A });
    expect(
      (store.team_availability_constraints as Row[])[0].tournament_id
    ).toBe(TOURN_A);
  });
});

describe('7. teams/[teamId] captain_id : membre non-coach de l’équipe', () => {
  beforeEach(() => {
    seedTeams();
    store.team_members = [
      {
        team_id: TEAM_A,
        tenant_id: TENANT_A,
        user_id: USER_MEMBER,
        role: 'player',
      },
      {
        team_id: TEAM_B,
        tenant_id: TENANT_B,
        user_id: USER_STRANGER,
        role: 'player',
      },
    ] as any;
  });

  it('refusé : un compte hors de l’équipe (autre espace) → 400, rien d’écrit', async () => {
    const err = await rejects(
      updateTeam(svc(TENANT_A), TEAM_A, { captain_id: USER_STRANGER })
    );
    expect(err.status).toBe(400);
    expect((store.teams as Row[])[0].captain_id).toBeNull();
  });

  it('autorisé : un membre de l’équipe devient capitaine', async () => {
    await updateTeam(svc(TENANT_A), TEAM_A, { captain_id: USER_MEMBER });
    expect((store.teams as Row[])[0].captain_id).toBe(USER_MEMBER);
  });
});

/* 8. twitch/eventsub/tcg-drop -------------------------------------------- */

describe('8. eventsub/tcg-drop : carte mise en avant de l’espace, publiée', () => {
  beforeEach(() => {
    process.env.TWITCH_CLIENT_ID = 'test-client-id';
    delete process.env.TWITCH_EVENTSUB_SECRET;
    broadcasterTokenMock.mockResolvedValue({
      accessToken: 'x',
      scope: ['channel:read:redemptions', 'channel:manage:redemptions'],
    });
    store.tcg_fanart_cards = [
      {
        id: CARD_A,
        tenant_id: TENANT_A,
        title: 'Rose',
        category: 'association',
        status: 'approved',
      },
      {
        id: CARD_B,
        tenant_id: TENANT_B,
        title: 'Autre',
        category: 'association',
        status: 'approved',
      },
    ] as any;
  });

  it('refusé : carte d’un autre espace → 404 card_not_found, rien d’écrit', async () => {
    const before = JSON.stringify(store.twitch_broadcaster_connections ?? null);
    const err = await rejects(
      subscribeTcgDrop(svc(TENANT_A), {
        rewardId: 'rw-1',
        featuredFanartId: CARD_B,
      })
    );
    expect(err.status).toBe(404);
    expect(JSON.stringify(store.twitch_broadcaster_connections ?? null)).toBe(
      before
    );
  });

  it('autorisé : carte publiée de l’espace (la suite échoue plus loin, secret absent)', async () => {
    const err = await rejects(
      subscribeTcgDrop(svc(TENANT_A), {
        rewardId: 'rw-1',
        featuredFanartId: CARD_A,
      })
    );
    expect(err.status).toBe(503);
  });
});

/* 9. clé API partenaire (comp) ------------------------------------------- */

describe('9. clé partenaire (comp) : pôle-admin ou owner global', () => {
  it('refusé : un owner d’espace (compte développeur) ne s’émet pas de clé gratuite', async () => {
    devAccount();
    const res = makeRes();
    await apiTokensHandler(
      makeReq({
        method: 'POST',
        body: { name: 'free', scopes: ['matches:read'], comp: true },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_COMP');
    expect(store.api_tokens ?? []).toEqual([]);
  });

  it('autorisé : un owner global émet une clé partenaire', async () => {
    seedCaller('owner', { tenantRole: 'owner' });
    const res = makeRes();
    await apiTokensHandler(
      makeReq({
        method: 'POST',
        body: { name: 'partner', scopes: ['matches:read'], comp: true },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
  });
});
