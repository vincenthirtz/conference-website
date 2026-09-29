// Lot P0 — sécurité : droits d'équipe et fuite publique
// (docs/PLAN-industrialisation-joueur.md, § P0).
//
//   S1 — `hasTeamPermission` n'a plus de passe-droit staff : un admin global
//        sans droit d'équipe reçoit 403 sur les routes qui s'y fient, que
//        l'équipe soit d'un autre tenant ou du sien.
//   S2 — la config des rôles appliquée est celle du TENANT DE L'ÉQUIPE, et les
//        surcharges déléguées (J3) de ce tenant sont honorées.
//   S3 — `GET /api/teams/[teamId]` ne rend que des colonnes publiques et
//        répond 404 pour une équipe supprimée ou désactivée.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setCookieUser,
  storageUploads,
  setStorageUploadResult,
  setAdminUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { hasTeamPermission } from '../../utils/teams/permissions';
import { TEAM_ROLES_SETTING_KEY } from '../../utils/teamRoles';

import publicPageHandler from '../../pages/api/teams/[teamId]/public-page';
import uploadImageHandler from '../../pages/api/teams/[teamId]/upload-image';
import tcgImageHandler from '../../pages/api/teams/[teamId]/tcg-image';
import memberProfileHandler from '../../pages/api/teams/[teamId]/members/[memberId]/profile';
import teamRhythmHandler from '../../pages/api/player/team-rhythm';
import publicTeamHandler from '../../pages/api/teams/[teamId]';
import { getServerSideProps as editTeamSSR } from '../../pages/team/[slug]/edit';

const TENANT_B = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';

const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const CAPTAIN_A = 'c0000000-0000-4000-8000-00000000000a';
const CAPTAIN_B = 'c0000000-0000-4000-8000-00000000000b';
const MANAGER_A = 'd0000000-0000-4000-8000-00000000000a';
const MANAGER_B = 'd0000000-0000-4000-8000-00000000000b';
const COACH_B = 'e0000000-0000-4000-8000-00000000000b';
const PLAYER_B = 'f0000000-0000-4000-8000-00000000000b';
const STAFF_ADMIN = '5a000000-0000-4000-8000-0000000000ad';

const MEMBER_ROW_B = '9b000000-0000-4000-8000-000000000001';
const MEMBER_ROW_A = '9a000000-0000-4000-8000-000000000001';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let _tok = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _tok += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer p0-${Date.now()}-${_tok}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function teamRow(id: string, tenantId: string, captainId: string) {
  return {
    id,
    tenant_id: tenantId,
    name: `Team ${id.slice(0, 4)}`,
    short_name: id.slice(0, 3).toUpperCase(),
    slug: `team-${id.slice(0, 4)}`,
    logo_url: null,
    tcg_image_path: null,
    description: 'original',
    captain_id: captainId,
    discord_role_id: '111111111111111111',
    discord_channel_id: '222222222222222222',
    discord_voice_channel_id: '333333333333333333',
    is_active: true,
    deleted_at: null,
  };
}

function seed() {
  store.teams = [
    teamRow(TEAM_A, CONFERENCE_TENANT_ID, CAPTAIN_A),
    teamRow(TEAM_B, TENANT_B, CAPTAIN_B),
  ] as any;
  store.team_members = [
    {
      id: MEMBER_ROW_A,
      team_id: TEAM_A,
      user_id: MANAGER_A,
      role: 'manager',
      display_name: 'MgrA',
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      // Le staff admin est aussi une simple joueuse de l'équipe A.
      id: '9a000000-0000-4000-8000-000000000002',
      team_id: TEAM_A,
      user_id: STAFF_ADMIN,
      role: 'player',
      display_name: 'StaffPlayer',
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      id: MEMBER_ROW_B,
      team_id: TEAM_B,
      user_id: MANAGER_B,
      role: 'manager',
      display_name: 'MgrB',
      tenant_id: TENANT_B,
    },
    {
      id: '9b000000-0000-4000-8000-000000000002',
      team_id: TEAM_B,
      user_id: COACH_B,
      role: 'coach',
      display_name: 'CoachB',
      tenant_id: TENANT_B,
    },
    {
      id: '9b000000-0000-4000-8000-000000000003',
      team_id: TEAM_B,
      user_id: PLAYER_B,
      role: 'player',
      display_name: 'PlayerB',
      tenant_id: TENANT_B,
    },
  ] as any;
  store.team_member_permissions = [] as any;
  store.team_availability = [] as any;
  store.staff = [
    {
      id: 'staff-p0',
      auth_user_id: STAFF_ADMIN,
      email: 'admin@example.com',
      role: 'admin',
      is_active: true,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setStorageUploadResult({ error: null });
  seed();
});

/* ------------------------------------------------------------------ */
/* S1 — plus de passe-droit staff                                      */
/* ------------------------------------------------------------------ */

describe('S1 — un staff admin global sans act-as est un compte comme un autre', () => {
  beforeEach(() => {
    setAuthUser({ id: STAFF_ADMIN });
  });

  it('hasTeamPermission : false sur l’équipe d’un autre tenant et sur une équipe du sien', async () => {
    expect(
      await hasTeamPermission(STAFF_ADMIN, TEAM_B, 'edit_public_page')
    ).toBe(false);
    // Équipe de son propre tenant, où il n'est qu'une joueuse.
    expect(
      await hasTeamPermission(STAFF_ADMIN, TEAM_A, 'edit_public_page')
    ).toBe(false);
    expect(await hasTeamPermission(STAFF_ADMIN, TEAM_A, 'manage_scrims')).toBe(
      false
    );
  });

  it.each([TEAM_B, TEAM_A])(
    'PATCH public-page → 403 (équipe %s)',
    async (teamId) => {
      const res = makeRes();
      await publicPageHandler(
        makeReq({
          method: 'PATCH',
          query: { teamId },
          body: { description: 'edited by staff' },
        }),
        res
      );
      expect(res.statusCode).toBe(403);
      const row = (store.teams as any[]).find((t) => t.id === teamId);
      expect(row.description).toBe('original');
    }
  );

  it.each([TEAM_B, TEAM_A])(
    'POST upload-image → 403 (équipe %s)',
    async (teamId) => {
      const res = makeRes();
      await uploadImageHandler(
        makeReq({
          method: 'POST',
          query: { teamId },
          body: { data: PNG_BASE64, mimeType: 'image/png' },
        }),
        res
      );
      expect(res.statusCode).toBe(403);
      expect(storageUploads).toHaveLength(0);
    }
  );

  it.each([TEAM_B, TEAM_A])(
    'POST tcg-image → 403 (équipe %s)',
    async (teamId) => {
      const res = makeRes();
      await tcgImageHandler(
        makeReq({
          method: 'POST',
          query: { teamId },
          body: { data: PNG_BASE64, mimeType: 'image/png' },
        }),
        res
      );
      expect(res.statusCode).toBe(403);
      expect(storageUploads).toHaveLength(0);
    }
  );

  it('PATCH members/[memberId]/profile → 403 sur son tenant, refus sur un autre', async () => {
    const own = makeRes();
    await memberProfileHandler(
      makeReq({
        method: 'PATCH',
        query: { teamId: TEAM_A, memberId: MEMBER_ROW_A },
        body: { display_name: 'StaffEdit' },
      }),
      own
    );
    expect(own.statusCode).toBe(403);

    const other = makeRes();
    await memberProfileHandler(
      makeReq({
        method: 'PATCH',
        query: { teamId: TEAM_B, memberId: MEMBER_ROW_B },
        body: { display_name: 'StaffEdit' },
      }),
      other
    );
    // 404 : la route ne voit même pas le membre hors de son tenant — refus
    // dans tous les cas, jamais d'écriture.
    expect([403, 404]).toContain(other.statusCode);

    const names = (store.team_members as any[]).map((m) => m.display_name);
    expect(names).not.toContain('StaffEdit');
  });

  it('GET player/team-rhythm → canAnnounce false pour le staff simple joueuse', async () => {
    const res = makeRes();
    await teamRhythmHandler(makeReq({ query: { teamId: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.canAnnounce).toBe(false);
  });

  it('SSR /team/[slug]/edit → redirection vers la fiche publique', async () => {
    setCookieUser({ id: STAFF_ADMIN });
    const result: any = await editTeamSSR({
      params: { slug: TEAM_A },
      req: { headers: { host: 'h' }, cookies: {} },
      res: { setHeader: () => {}, getHeader: () => undefined },
      query: {},
      resolvedUrl: `/team/${TEAM_A}/edit`,
    } as any);
    expect(result.redirect?.destination).toBe(`/team/${TEAM_A}`);
  });

  it('témoin : le manager de l’équipe garde l’accès (pas de régression)', async () => {
    setAuthUser({ id: MANAGER_A });
    const res = makeRes();
    await publicPageHandler(
      makeReq({
        method: 'PATCH',
        query: { teamId: TEAM_A },
        body: { description: 'edited by manager' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* P10 — l'édition staff passe par l'act-as journalisé                  */
/* ------------------------------------------------------------------ */

describe('P10 — act-as staff sur page publique / images d’équipe', () => {
  beforeEach(() => {
    setAuthUser({ id: STAFF_ADMIN });
    // Un sujet inconnu est un 404 (`resolveSubject`) : on les déclare.
    for (const id of [MANAGER_A, MANAGER_B, STAFF_ADMIN]) {
      setAdminUser(id, `${id.slice(0, 4)}@example.com`);
    }
  });

  const staffLogs = () =>
    ((store as any).staff_logs ?? []) as Array<{ action: string }>;

  it('PATCH public-page ?as=<manager>&act=1 → écrit, journalisé act_as_player', async () => {
    const res = makeRes();
    await publicPageHandler(
      makeReq({
        method: 'PATCH',
        query: { teamId: TEAM_A, as: MANAGER_A, act: '1' },
        body: { description: 'edited as manager' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.teams as any[]).find((t) => t.id === TEAM_A);
    expect(row.description).toBe('edited as manager');
    expect(staffLogs().some((l) => l.action === 'act_as_player')).toBe(true);
  });

  it('sans la seconde clé (`act=1`) : lecture seule, rien n’est écrit', async () => {
    const res = makeRes();
    await publicPageHandler(
      makeReq({
        method: 'PATCH',
        query: { teamId: TEAM_A, as: MANAGER_A },
        body: { description: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    const row = (store.teams as any[]).find((t) => t.id === TEAM_A);
    expect(row.description).toBe('original');
  });

  it('le droit est celui du SUJET : représenter une simple joueuse → 403', async () => {
    const res = makeRes();
    await tcgImageHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_A, as: STAFF_ADMIN, act: '1' },
        body: { data: PNG_BASE64, mimeType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(storageUploads).toHaveLength(0);
  });

  it('équipe d’un autre tenant que celui du staff → refus, rien n’est écrit', async () => {
    const res = makeRes();
    await publicPageHandler(
      makeReq({
        method: 'PATCH',
        query: { teamId: TEAM_B, as: MANAGER_B, act: '1' },
        body: { description: 'cross-tenant' },
      }),
      res
    );
    expect([403, 404]).toContain(res.statusCode);
    const row = (store.teams as any[]).find((t) => t.id === TEAM_B);
    expect(row.description).toBe('original');
  });

  it('POST upload-image ?as=<manager>&act=1 → déposé', async () => {
    const res = makeRes();
    await uploadImageHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_A, as: MANAGER_A, act: '1' },
        body: { data: PNG_BASE64, mimeType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(storageUploads.length).toBeGreaterThan(0);
  });

  it('PATCH members/[memberId]/profile ?as=<manager>&act=1 → écrit, journalisé', async () => {
    const res = makeRes();
    await memberProfileHandler(
      makeReq({
        method: 'PATCH',
        query: {
          teamId: TEAM_A,
          memberId: MEMBER_ROW_A,
          as: MANAGER_A,
          act: '1',
        },
        body: { display_name: 'EditedAs' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const names = (store.team_members as any[]).map((m) => m.display_name);
    expect(names).toContain('EditedAs');
    expect(staffLogs().some((l) => l.action === 'act_as_player')).toBe(true);
  });

  const ssr = (query: Record<string, string>) =>
    editTeamSSR({
      params: { slug: TEAM_A },
      req: { headers: { host: 'h' }, cookies: {} },
      res: { setHeader: () => {}, getHeader: () => undefined },
      query,
      resolvedUrl: `/team/${TEAM_A}/edit`,
    } as any) as Promise<any>;

  it('SSR /team/[slug]/edit ?as=<manager>&act=1 → éditeur ouvert, entrée journalisée', async () => {
    setCookieUser({ id: STAFF_ADMIN });
    const result = await ssr({ as: MANAGER_A, act: '1' });
    expect(result.props?.team?.id).toBe(TEAM_A);
    expect(result.props?.subjectScope).toEqual({
      subjectId: MANAGER_A,
      actAs: true,
    });
    const entry = ((store as any).staff_logs ?? []).find(
      (l: any) => l.action === 'view_captain_data'
    );
    expect(entry?.entity_id).toBe(MANAGER_A);
    expect(entry?.payload?.act).toBe(true);
  });

  it('SSR sans `act=1`, ou sujet sans le droit → refus', async () => {
    setCookieUser({ id: STAFF_ADMIN });
    expect((await ssr({ as: MANAGER_A })).redirect?.destination).toBe('/403');
    // Représenter une simple joueuse : le droit est celui du SUJET.
    expect(
      (await ssr({ as: STAFF_ADMIN, act: '1' })).redirect?.destination
    ).toBe(`/team/${TEAM_A}`);
  });

  it('SSR ?as= par un compte non staff → /403', async () => {
    setCookieUser({ id: MANAGER_B });
    const result = await ssr({ as: MANAGER_A, act: '1' });
    expect(result.redirect?.destination).toBe('/403');
  });

  it('SSR sans ?as= : la manager ouvre son éditeur (témoin)', async () => {
    setCookieUser({ id: MANAGER_A });
    const result = await ssr({});
    expect(result.props?.team?.id).toBe(TEAM_A);
    expect(result.props?.subjectScope).toEqual({
      subjectId: null,
      actAs: false,
    });
  });
});

/* ------------------------------------------------------------------ */
/* S2 — config de rôles et délégations du tenant de l'équipe           */
/* ------------------------------------------------------------------ */

describe('S2 — la config de rôles du tenant B s’applique aux équipes du tenant B', () => {
  beforeEach(() => {
    store.site_settings = [
      {
        // Tenant B : le manager perd la page publique, le coach la gagne.
        tenant_id: TENANT_B,
        key: TEAM_ROLES_SETTING_KEY,
        value: JSON.stringify([
          { value: 'player', label: 'Player', permissions: [] },
          {
            value: 'coach',
            label: 'Coach',
            permissions: ['manage_scrims', 'edit_public_page'],
          },
          {
            value: 'manager',
            label: 'Manager',
            permissions: ['manage_roster'],
          },
        ]),
        description: null,
      },
    ] as any;
  });

  it('manager B privé de edit_public_page par SON tenant', async () => {
    expect(await hasTeamPermission(MANAGER_B, TEAM_B, 'edit_public_page')).toBe(
      false
    );
    expect(await hasTeamPermission(MANAGER_B, TEAM_B, 'manage_roster')).toBe(
      true
    );
  });

  it('coach B reçoit edit_public_page de SON tenant', async () => {
    expect(await hasTeamPermission(COACH_B, TEAM_B, 'edit_public_page')).toBe(
      true
    );
  });

  it('le tenant A (défaut) n’est pas affecté par la config de B', async () => {
    expect(await hasTeamPermission(MANAGER_A, TEAM_A, 'edit_public_page')).toBe(
      true
    );
  });

  it('route upload-image : manager B → 403 (config B obéie)', async () => {
    setAuthUser({ id: MANAGER_B });
    const res = makeRes();
    await uploadImageHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_B },
        body: { data: PNG_BASE64, mimeType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('délégation J3 du tenant B honorée', async () => {
    expect(await hasTeamPermission(PLAYER_B, TEAM_B, 'edit_public_page')).toBe(
      false
    );
    store.team_member_permissions = [
      {
        id: 'tmp-1',
        team_id: TEAM_B,
        user_id: PLAYER_B,
        permission: 'edit_public_page',
        tenant_id: TENANT_B,
        revoked_at: null,
      },
    ] as any;
    expect(await hasTeamPermission(PLAYER_B, TEAM_B, 'edit_public_page')).toBe(
      true
    );
  });

  it('le capitaine B garde toutes les permissions', async () => {
    expect(await hasTeamPermission(CAPTAIN_B, TEAM_B, 'edit_public_page')).toBe(
      true
    );
  });
});

/* ------------------------------------------------------------------ */
/* S3 — fiche publique d'équipe                                         */
/* ------------------------------------------------------------------ */

describe('S3 — GET /api/teams/[teamId] ne rend que des colonnes publiques', () => {
  const INTERNAL = [
    'captain_id',
    'discord_role_id',
    'discord_channel_id',
    'discord_voice_channel_id',
    'deleted_at',
    'is_active',
    'tenant_id',
    'tcg_image_path',
  ];

  it('200 sans aucune colonne interne', async () => {
    const res = makeRes();
    await publicTeamHandler(makeReq({ query: { teamId: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.team.id).toBe(TEAM_A);
    expect(res.body.team.name).toBeTruthy();
    for (const column of INTERNAL) {
      expect(res.body.team).not.toHaveProperty(column);
    }
    expect(res.headers['Cache-Control']).toContain('s-maxage=300');
  });

  it('404 sur une équipe supprimée', async () => {
    (store.teams as any[])[0].deleted_at = '2026-09-01T00:00:00.000Z';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await publicTeamHandler(makeReq({ query: { teamId: TEAM_A } }), res);
    spy.mockRestore();
    expect(res.statusCode).toBe(404);
  });

  it('404 sur une équipe désactivée', async () => {
    (store.teams as any[])[0].is_active = false;
    const res = makeRes();
    await publicTeamHandler(makeReq({ query: { teamId: TEAM_A } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('405 avec Allow sur une méthode autre que GET', async () => {
    const res = makeRes();
    await publicTeamHandler(
      makeReq({ method: 'POST', query: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
