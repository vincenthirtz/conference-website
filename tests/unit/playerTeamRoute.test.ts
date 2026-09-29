// GET / PATCH /api/player/team — « Mon équipe » sur defineSubjectRoute
// (lot P10 ; ex-/api/admin/teams/my, qui en reste un réexport).
//
// Contrat inchangé ({ team, members, isCaptain, isManager, permissions,
// managedTeams } ; PATCH → { team, members: [], isCaptain, isManager }) et
// règles de droit au service : la capitaine a tout, la coach n'a ni l'identité
// de l'équipe ni le roster ; l'act-as staff écrit avec le droit du SUJET.

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
  setAdminUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/player/team';
import legacyHandler from '../../pages/api/admin/teams/my';

const TEAM_ID = '1a2b3c4d-0000-4000-8000-000000000001';
const CAPTAIN_ID = '1a2b3c4d-0000-4000-8000-0000000000ca';
const COACH_ID = '1a2b3c4d-0000-4000-8000-0000000000c0';
const STAFF_ID = '1a2b3c4d-0000-4000-8000-0000000000ad';

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer player-team-${n}` },
    query: {},
    body: {},
    cookies: {},
    socket: { remoteAddress: '127.0.0.1' },
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

const team = () => (store.teams as any[]).find((t) => t.id === TEAM_ID);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      slug: 'alpha',
      name: 'Alpha',
      short_name: 'ALP',
      logo_url: null,
      country: 'FR',
      description: null,
      captain_id: CAPTAIN_ID,
      is_active: true,
      is_joinable: false,
      open_for_scrim: false,
      skill_rating: null,
    },
  ] as any;
  store.team_members = [
    {
      id: 'm-cap',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      battle_tag: 'Cap#1',
      is_substitute: false,
    },
    {
      id: 'm-coach',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: COACH_ID,
      role: 'coach',
      display_name: 'Coach',
      battle_tag: null,
      is_substitute: false,
    },
  ] as any;
  store.staff = [
    {
      id: 'staff-team',
      auth_user_id: STAFF_ID,
      email: 'admin@example.com',
      role: 'admin',
      is_active: true,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  setAdminUser(CAPTAIN_ID, 'cap@example.com');
});

describe('GET /api/player/team', () => {
  it('la capitaine : même contrat, toutes les permissions', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const b = res.body as any;
    expect(b.team.id).toBe(TEAM_ID);
    expect(b.isCaptain).toBe(true);
    expect(b.members).toHaveLength(2);
    expect(b.permissions).toEqual(
      expect.arrayContaining(['manage_roster', 'manage_team_info'])
    );
    expect(Array.isArray(b.managedTeams)).toBe(true);
  });

  it('la coach : jamais le roster ni l’identité de l’équipe', async () => {
    setAuthUser({ id: COACH_ID });
    const res = makeRes();
    await handler(makeReq(), res);
    const perms = (res.body as any).permissions as string[];
    expect(perms).not.toContain('manage_roster');
    expect(perms).not.toContain('manage_team_info');
  });

  it('l’ancienne URL sert la même réponse', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const a = makeRes();
    const b = makeRes();
    await handler(makeReq(), a);
    await legacyHandler(makeReq(), b);
    expect(b.statusCode).toBe(200);
    expect(b.body).toEqual(a.body);
  });

  it('inspection staff (?as=) : la tranche du sujet, sans cache partagé', async () => {
    setAuthUser({ id: STAFF_ID });
    const res = makeRes();
    await handler(makeReq({ query: { as: CAPTAIN_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).isCaptain).toBe(true);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('PATCH /api/player/team', () => {
  it('la capitaine renomme son équipe', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(
      makeReq({ method: 'PATCH', body: { teamId: TEAM_ID, name: 'Omega' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(team().name).toBe('Omega');
    expect((res.body as any).members).toEqual([]);
  });

  it('la coach est refusée (manage_team_info) — rien n’est écrit', async () => {
    setAuthUser({ id: COACH_ID });
    const res = makeRes();
    await handler(
      makeReq({ method: 'PATCH', body: { teamId: TEAM_ID, name: 'Omega' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(team().name).toBe('Alpha');
  });

  it('400 historique sans teamId, et sur un nom trop court', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const noTeam = makeRes();
    await handler(makeReq({ method: 'PATCH', body: { name: 'X' } }), noTeam);
    expect(noTeam.statusCode).toBe(400);
    expect((noTeam.body as any).error).toBe('teamId required.');

    const short = makeRes();
    await handler(
      makeReq({ method: 'PATCH', body: { teamId: TEAM_ID, name: 'X' } }),
      short
    );
    expect(short.statusCode).toBe(400);
    expect((short.body as any).error).toBe(
      'Le nom doit faire entre 2 et 100 caractères.'
    );
  });

  it('staff : ?as= sans act=1 → lecture seule ; avec act=1 → droit du sujet', async () => {
    setAuthUser({ id: STAFF_ID });
    const ro = makeRes();
    await handler(
      makeReq({
        method: 'PATCH',
        query: { as: CAPTAIN_ID },
        body: { teamId: TEAM_ID, name: 'Omega' },
      }),
      ro
    );
    expect(ro.statusCode).toBe(403);
    expect(team().name).toBe('Alpha');

    const acting = makeRes();
    await handler(
      makeReq({
        method: 'PATCH',
        query: { as: CAPTAIN_ID, act: '1' },
        body: { teamId: TEAM_ID, name: 'Omega' },
      }),
      acting
    );
    expect(acting.statusCode).toBe(200);
    expect(team().name).toBe('Omega');
  });

  it('405 avec Allow sur une autre méthode', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
    expect(String(res.headers.Allow)).toContain('PATCH');
  });
});
