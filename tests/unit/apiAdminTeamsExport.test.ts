// tests/unit/apiAdminTeamsExport.test.ts
//
// GET /api/admin/teams/export — extraction CSV / JSON des équipes.
//
// Ce qui compte ici, au-delà du format (couvert par teamExport.test.ts) :
//   - la permission `manage_teams` (un caster n'extrait pas les effectifs) ;
//   - le cloisonnement par tenant, y compris pour une équipe demandée par id ;
//   - les mêmes filtres que la liste admin ;
//   - aucune donnée personnelle dans la réponse (email, user_id) ;
//   - l'export est journalisé.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/teams/export';

const TENANT = CONFERENCE_TENANT_ID;
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'user-staff';

const T_ECL = '11111111-1111-4111-8111-111111111111';
const T_ZEN = '22222222-2222-4222-8222-222222222222';
const T_AUR = '33333333-3333-4333-8333-333333333333';
const T_OTHER = '44444444-4444-4444-8444-444444444444';
const T_DELETED = '55555555-5555-4555-8555-555555555555';
const TOUR = '66666666-6666-4666-8666-666666666666';
const TOUR_OTHER = '77777777-7777-4777-8777-777777777777';

const U1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const U3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const U4 = 'aaaaaaaa-0000-4000-8000-000000000004';

let _t = 0;
function makeReq(
  query: Record<string, string | string[]> = {},
  method = 'GET'
): any {
  _t += 1;
  return {
    method,
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    cookies: {},
    query,
    body: {},
  };
}
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedStaff(role: string) {
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'staff@example.test',
      role,
      display_name: 'Staff',
      avatar_url: null,
      is_active: true,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seedStaff('admin');

  store.teams = [
    {
      id: T_ZEN,
      tenant_id: TENANT,
      name: 'Zénith',
      slug: 'zenith',
      short_name: 'ZEN',
      logo_url: null,
      captain_id: U4,
      is_active: false,
      deleted_at: null,
    },
    {
      id: T_ECL,
      tenant_id: TENANT,
      name: 'Éclypse',
      slug: 'eclypse',
      short_name: 'ECL',
      logo_url: 'https://cdn.example.test/ecl.png',
      captain_id: U1,
      is_active: true,
      deleted_at: null,
    },
    {
      id: T_AUR,
      tenant_id: TENANT,
      name: 'Aurora',
      slug: 'aurora',
      short_name: null,
      logo_url: null,
      captain_id: null,
      is_active: true,
      deleted_at: null,
    },
    {
      id: T_OTHER,
      tenant_id: OTHER_TENANT,
      name: 'Ailleurs',
      slug: 'ailleurs',
      short_name: 'AIL',
      logo_url: null,
      captain_id: null,
      is_active: true,
      deleted_at: null,
    },
    {
      id: T_DELETED,
      tenant_id: TENANT,
      name: 'Supprimée',
      slug: 'supprimee',
      short_name: 'DEL',
      logo_url: null,
      captain_id: null,
      is_active: false,
      deleted_at: '2026-08-01T00:00:00.000Z',
    },
  ] as any;

  store.team_members = [
    {
      id: 'm1',
      tenant_id: TENANT,
      team_id: T_ECL,
      user_id: U1,
      role: 'player',
      specialty: 'dps',
      is_substitute: false,
      battle_tag: 'Alpha#1234',
      display_name: null,
    },
    {
      id: 'm2',
      tenant_id: TENANT,
      team_id: T_ECL,
      user_id: U2,
      role: 'player',
      specialty: 'support',
      is_substitute: true,
      battle_tag: 'Beta#5678',
      display_name: 'Bêta',
    },
    {
      id: 'm3',
      tenant_id: TENANT,
      team_id: T_ECL,
      user_id: U3,
      role: 'coach',
      specialty: null,
      is_substitute: false,
      battle_tag: null,
      display_name: null,
    },
    {
      id: 'm4',
      tenant_id: TENANT,
      team_id: T_ZEN,
      user_id: U4,
      role: 'player',
      specialty: 'tank',
      is_substitute: false,
      battle_tag: 'Zoe#9999',
      display_name: null,
    },
    {
      id: 'm5',
      tenant_id: OTHER_TENANT,
      team_id: T_OTHER,
      user_id: 'aaaaaaaa-0000-4000-8000-000000000009',
      role: 'player',
      specialty: null,
      is_substitute: false,
      battle_tag: 'Autre#1111',
      display_name: null,
    },
  ] as any;

  store.user_discord_links = [
    { auth_user_id: U1, discord_user_id: '1', discord_username: 'alpha_dc' },
    { auth_user_id: U3, discord_user_id: '3', discord_username: 'coachy' },
  ] as any;

  store.tournaments = [
    { id: TOUR, tenant_id: TENANT, name: 'Coupe d’été 2026' },
    { id: TOUR_OTHER, tenant_id: OTHER_TENANT, name: 'Autre coupe' },
  ] as any;

  store.tournament_teams = [
    {
      tenant_id: TENANT,
      tournament_id: TOUR,
      team_id: T_ECL,
      status: 'confirmed',
    },
    {
      tenant_id: TENANT,
      tournament_id: TOUR,
      team_id: T_AUR,
      status: 'pending',
    },
  ] as any;

  store.staff_logs = [] as any;
});

describe('GET /api/admin/teams/export — accès', () => {
  it('401 sans session', async () => {
    setAuthUser(null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 sans la permission manage_teams (caster)', async () => {
    seedStaff('caster');
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('405 + Allow sur une autre méthode', async () => {
    const res = makeRes();
    await handler(makeReq({}, 'POST'), res);
    // POST sans Origin/Referer tombe d'abord sur le garde CSRF (403) ou sur
    // la route (405) : dans les deux cas, rien n'est exporté.
    expect([403, 405]).toContain(res.statusCode);
    if (res.statusCode === 405) expect(res.headers.Allow).toBe('GET');
  });
});

describe('GET /api/admin/teams/export — validation', () => {
  it('400 sur un teamId qui n’est pas un UUID', async () => {
    const res = makeRes();
    await handler(makeReq({ teamId: 'pas-un-uuid' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
    expect(res.body.fields.teamId).toBeTruthy();
  });

  it('400 sur un tournamentId invalide ou un format inconnu', async () => {
    const r1 = makeRes();
    await handler(makeReq({ tournamentId: '1; drop' }), r1);
    expect(r1.statusCode).toBe(400);

    const r2 = makeRes();
    await handler(makeReq({ format: 'xlsx' }), r2);
    expect(r2.statusCode).toBe(400);
    expect(r2.body.fields.format).toBeTruthy();
  });

  it('un paramètre vide vaut « pas de filtre »', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: '', teamId: '' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.tournament).toBeNull();
  });
});

describe('GET /api/admin/teams/export — JSON', () => {
  it('toutes les équipes du tenant, triées à la française, corbeille exclue', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body.truncated).toBe(false);
    expect(res.body.tournament).toBeNull();
    expect(typeof res.body.generatedAt).toBe('string');
    expect(res.body.teams.map((t: any) => t.name)).toEqual([
      'Aurora',
      'Éclypse',
      'Zénith',
    ]);
  });

  it('rend la répartition, la capitaine et le pseudo Discord', async () => {
    const res = makeRes();
    await handler(makeReq({ teamId: T_ECL }), res);

    expect(res.statusCode).toBe(200);
    const [team] = res.body.teams;
    expect(team).toMatchObject({
      id: T_ECL,
      name: 'Éclypse',
      shortName: 'ECL',
      logoUrl: 'https://cdn.example.test/ecl.png',
      registrationStatus: null,
    });
    expect(team.members.roster).toEqual([
      {
        pseudo: 'Alpha',
        battleTag: 'Alpha#1234',
        discord: 'alpha_dc',
        role: 'player',
        specialty: 'dps',
        isCaptain: true,
      },
    ]);
    expect(team.members.subs.map((m: any) => m.pseudo)).toEqual(['Bêta']);
    expect(team.members.staff).toEqual([
      {
        pseudo: 'coachy',
        battleTag: null,
        discord: 'coachy',
        role: 'coach',
        specialty: null,
        isCaptain: false,
      },
    ]);
  });

  it('prend le pseudo du compte, jamais son email ni son nom complet', async () => {
    setAuthListUsers([
      {
        id: U4,
        email: 'zoe.secret@example.test',
        user_metadata: { display_name: 'ZoeCompte', full_name: 'Zoé Martin' },
      } as any,
    ]);
    const res = makeRes();
    await handler(makeReq({ teamId: T_ZEN }), res);

    expect(res.body.teams[0].members.roster[0].pseudo).toBe('ZoeCompte');
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('zoe.secret');
    expect(json).not.toContain('Zoé Martin');
    expect(json).not.toContain(U4);
    expect(json).not.toMatch(/captainUserId|user_id|email/);
  });

  it('404 TEAM_NOT_FOUND pour une équipe d’un autre tenant ou supprimée', async () => {
    for (const id of [T_OTHER, T_DELETED]) {
      const res = makeRes();
      await handler(makeReq({ teamId: id }), res);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('TEAM_NOT_FOUND');
    }
  });

  it('404 TOURNAMENT_NOT_FOUND pour un tournoi d’un autre tenant', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TOUR_OTHER }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('TOURNAMENT_NOT_FOUND');
  });

  it('filtre par tournoi et rend le statut d’inscription', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TOUR }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.tournament).toEqual({ id: TOUR, name: 'Coupe d’été 2026' });
    expect(
      res.body.teams.map((t: any) => [t.name, t.registrationStatus])
    ).toEqual([
      ['Aurora', 'pending'],
      ['Éclypse', 'confirmed'],
    ]);
  });

  it('applique search et isActive comme la liste admin', async () => {
    const r1 = makeRes();
    await handler(makeReq({ search: 'zén' }), r1);
    expect(r1.body.teams.map((t: any) => t.name)).toEqual(['Zénith']);

    const r2 = makeRes();
    await handler(makeReq({ isActive: 'false' }), r2);
    expect(r2.body.teams.map((t: any) => t.name)).toEqual(['Zénith']);
  });

  it('journalise l’export', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TOUR, format: 'csv' }), res);

    const logs = store.staff_logs as any[];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      staff_id: 'staff-1',
      action: 'view_player_data',
      entity_type: 'team',
      tournament_id: TOUR,
      tenant_id: TENANT,
    });
    expect(logs[0].payload).toMatchObject({
      kind: 'teams_export',
      format: 'csv',
      count: 2,
      truncated: false,
      filters: { tournamentId: TOUR },
      permission: 'manage_teams',
    });
  });
});

describe('GET /api/admin/teams/export — CSV', () => {
  it('en-têtes, BOM, séparateur ; et une ligne par membre', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TOUR, format: 'csv' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['Content-Disposition']).toMatch(
      /^attachment; filename="equipes-coupe-d-ete-2026-\d{4}-\d{2}-\d{2}\.csv"$/
    );

    const csv = res.body as string;
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toEqual([
      'equipe;tag;statut_inscription;categorie;role;pseudo;battletag;discord',
      'Aurora;;pending;;;;;',
      'Éclypse;ECL;confirmed;roster;capitaine, dps;Alpha;Alpha#1234;alpha_dc',
      'Éclypse;ECL;confirmed;sub;support;Bêta;Beta#5678;',
      'Éclypse;ECL;confirmed;staff;coach;coachy;;coachy',
      '',
    ]);
    expect(csv).not.toContain(U1);
  });

  it('nom de fichier d’une équipe seule', async () => {
    const res = makeRes();
    await handler(makeReq({ teamId: T_ECL, format: 'csv' }), res);
    expect(res.headers['Content-Disposition']).toMatch(
      /^attachment; filename="equipe-eclypse-\d{4}-\d{2}-\d{2}\.csv"$/
    );
  });

  it('sans filtre : equipes-toutes, statut vide', async () => {
    const res = makeRes();
    await handler(makeReq({ format: 'csv' }), res);
    expect(res.headers['Content-Disposition']).toMatch(
      /filename="equipes-toutes-/
    );
    const lines = (res.body as string).slice(1).split('\r\n');
    expect(lines[1]).toBe('Aurora;;;;;;;');
  });
});
