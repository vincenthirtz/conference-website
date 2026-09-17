// tests/unit/externalScrimTeam.test.ts
// Équipe EXTÉRIEURE d'un scrim : créée à la volée depuis le formulaire admin,
// avec le logo Women's Cup (ou celui de la marque blanche du tenant) quand
// aucun logo n'est fourni — et jamais à la place d'un logo fourni.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock, readTenantBrandingMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
  readTenantBrandingMock: vi.fn(async () => null as unknown),
}));

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

vi.mock('@/utils/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/tenant')>()),
  readTenantBranding: readTenantBrandingMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import adminScrimsHandler from '../../pages/api/admin/scrims/index';
import adminScrimIdHandler from '../../pages/api/admin/scrims/[scrimId]/index';
import {
  WOMENS_CUP_LOGO_URL,
  withDefaultTeamLogo,
} from '../../utils/teams/defaultTeamLogo';
import { findOrCreateExternalScrimTeam } from '../../utils/teams/externalScrimTeam';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT_ID = '11111111-2222-4333-8444-555555555555';
const TEAM_A = '550e8400-e29b-41d4-a716-446655440b01';
const SCRIM_ID = '550e8400-e29b-41d4-a716-446655440aa1';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let tokenCounter = 0;
function makeReq(over: Record<string, unknown> = {}): any {
  tokenCounter += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${tokenCounter}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const teams = () => store.teams as any[];

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  readTenantBrandingMock.mockReset();
  readTenantBrandingMock.mockResolvedValue(null);
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: TENANT_ID,
      name: 'Phoenix',
      logo_url: '/img/teams-images/phoenix.png',
      is_active: true,
    },
  ] as any;
});

describe('withDefaultTeamLogo', () => {
  it('garde un logo fourni', async () => {
    expect(await withDefaultTeamLogo('https://cdn.test/l.png', TENANT_ID)).toBe(
      'https://cdn.test/l.png'
    );
    expect(readTenantBrandingMock).not.toHaveBeenCalled();
  });

  it("retombe sur le logo Women's Cup sans logo ni marque blanche", async () => {
    expect(await withDefaultTeamLogo(null, TENANT_ID)).toBe(
      WOMENS_CUP_LOGO_URL
    );
    expect(await withDefaultTeamLogo('   ', TENANT_ID)).toBe(
      WOMENS_CUP_LOGO_URL
    );
    expect(WOMENS_CUP_LOGO_URL).toBe(
      'https://owwomenscup.fr/img/logos/2026-logo.png'
    );
  });

  it('prend le logo de la marque blanche du tenant quand il existe', async () => {
    readTenantBrandingMock.mockResolvedValue({
      name: 'Autre ligue',
      slug: 'autre',
      logoUrl: 'https://x.supabase.co/storage/v1/object/public/l.png',
      primaryColor: null,
      accentColor: null,
    });
    expect(await withDefaultTeamLogo(undefined, OTHER_TENANT_ID)).toBe(
      'https://x.supabase.co/storage/v1/object/public/l.png'
    );
  });
});

describe('findOrCreateExternalScrimTeam', () => {
  it("crée l'équipe avec le logo par défaut", async () => {
    const r = await findOrCreateExternalScrimTeam({
      tenantId: TENANT_ID,
      name: 'Noname',
    });
    expect(r.ok && r.created).toBe(true);
    const row = teams().find((t) => t.name === 'Noname');
    expect(row.logo_url).toBe(WOMENS_CUP_LOGO_URL);
    expect(row.is_active).toBe(false);
    expect(row.tenant_id).toBe(TENANT_ID);
    expect(row.slug).toBe('noname');
  });

  it('garde le logo fourni', async () => {
    const r = await findOrCreateExternalScrimTeam({
      tenantId: TENANT_ID,
      name: 'Avec Logo',
      logoUrl: '/img/teams-images/avec-logo.png',
    });
    expect(r.ok && r.logoUrl).toBe('/img/teams-images/avec-logo.png');
    expect(teams().find((t) => t.name === 'Avec Logo').logo_url).toBe(
      '/img/teams-images/avec-logo.png'
    );
  });

  it('réutilise une équipe existante du même nom sans toucher à son logo', async () => {
    const r = await findOrCreateExternalScrimTeam({
      tenantId: TENANT_ID,
      name: 'PHOENIX',
    });
    expect(r).toMatchObject({ ok: true, teamId: TEAM_A, created: false });
    expect(teams()).toHaveLength(1);
    expect(teams()[0].logo_url).toBe('/img/teams-images/phoenix.png');
  });

  it('ne réutilise pas une équipe dont le nom ne fait que contenir celui saisi', async () => {
    const r = await findOrCreateExternalScrimTeam({
      tenantId: TENANT_ID,
      name: 'Phoe',
    });
    expect(r.ok && r.created).toBe(true);
    expect(teams()).toHaveLength(2);
  });
});

describe('POST /api/admin/scrims — équipe extérieure', () => {
  it("crée l'équipe extérieure (logo Women's Cup) et la lie au scrim", async () => {
    const res = makeRes();
    await adminScrimsHandler(
      makeReq({
        body: {
          name: 'Phoenix vs Noname',
          team1_id: TEAM_A,
          team2_name: '  Noname  ',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = teams().find((t) => t.name === 'Noname');
    expect(created).toBeTruthy();
    expect(created.logo_url).toBe(WOMENS_CUP_LOGO_URL);
    expect(res.body.scrim.team1_id).toBe(TEAM_A);
    expect(res.body.scrim.team2_id).toBe(created.id);
    expect(logStaffActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'team',
        entity_id: created.id,
      })
    );
  });

  it('400 quand un côté porte à la fois un id et un nom', async () => {
    const res = makeRes();
    await adminScrimsHandler(
      makeReq({
        body: { name: 'X', team1_id: TEAM_A, team1_name: 'Noname' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(teams()).toHaveLength(1);
  });

  it("400 sans créer d'équipe quand le nom saisi désigne l'autre équipe", async () => {
    const res = makeRes();
    await adminScrimsHandler(
      makeReq({
        body: { name: 'X', team1_id: TEAM_A, team2_name: 'phoenix' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(teams()).toHaveLength(1);
    expect(store.scrims ?? []).toHaveLength(0);
  });

  it("400 sans créer d'équipe sur une date invalide", async () => {
    const res = makeRes();
    await adminScrimsHandler(
      makeReq({
        body: { name: 'X', team2_name: 'Noname', scheduled_date: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(teams()).toHaveLength(1);
  });
});

describe('PATCH /api/admin/scrims/[scrimId] — équipe extérieure', () => {
  beforeEach(() => {
    store.scrims = [
      {
        id: SCRIM_ID,
        tenant_id: TENANT_ID,
        name: 'Existing',
        slug: 'existing',
        status: 'draft',
        team1_id: TEAM_A,
        team2_id: null,
      },
    ] as any;
  });

  it("crée l'équipe extérieure avec le logo par défaut et la pose en team2", async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeReq({
        method: 'PATCH',
        query: { scrimId: SCRIM_ID },
        body: { team2_id: null, team2_name: 'Visiteuses' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const created = teams().find((t) => t.name === 'Visiteuses');
    expect(created.logo_url).toBe(WOMENS_CUP_LOGO_URL);
    expect((store.scrims as any[])[0].team2_id).toBe(created.id);
    expect((store.scrims as any[])[0].team1_id).toBe(TEAM_A);
  });
});
