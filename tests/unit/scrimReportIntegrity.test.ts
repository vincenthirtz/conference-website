// tests/unit/scrimReportIntegrity.test.ts
//
// Lot 1 « intégrité des scores », variante SCRIM :
//   * un scrim clos que le staff rouvre (PATCH completed → scheduled) ne peut
//     plus être re-clos par la seule capitaine gagnante : reports purgés ;
//   * pas de report avant l'horaire planifié (409 SCRIM_NOT_STARTED), sauf
//     scrim `running`.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/scrimEvents', () => ({
  emitScrimEvent: vi.fn(async () => undefined),
  statusTransitionEvent: () => null,
}));
vi.mock('@/utils/scrims/ratedMatch', () => ({
  syncScrimRatedMatch: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import reportHandler from '../../pages/api/player/scrims/[scrimId]/report';
import adminScrimHandler from '../../pages/api/admin/scrims/[scrimId]/index';

const SCRIM_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAPTAIN_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CAPTAIN_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STAFF_AUTH = 'user-staff-1';

let _tok = 0;
function bearer() {
  _tok += 1;
  return `Bearer t-${Date.now()}-${_tok}`;
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

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: STAFF_AUTH,
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

const scrim = () => (store.scrims as any[])[0];

function seed(over: Record<string, unknown> = {}) {
  store.staff = [staffRow()] as any;
  store.teams = [
    {
      id: TEAM_A,
      name: 'Alpha',
      captain_id: CAPTAIN_A,
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
    },
    {
      id: TEAM_B,
      name: 'Bravo',
      captain_id: CAPTAIN_B,
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
    },
  ] as any;
  store.team_members = [] as any;
  store.scrims = [
    {
      id: SCRIM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha vs Bravo',
      slug: 'alpha-bravo',
      status: 'scheduled',
      ranked: true,
      scheduled_date: '2026-09-01T18:00:00.000Z',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      dispute_reason: null,
      deleted_at: null,
      ...over,
    },
  ] as any;
  store.scrim_score_reports = [] as any;
}

async function report(captain: string, team1Score: number, team2Score: number) {
  setAuthUser({ id: captain });
  const res = makeRes();
  await reportHandler(
    {
      method: 'POST',
      headers: { host: 'h', authorization: bearer() },
      query: { scrimId: SCRIM_ID },
      body: { team1Score, team2Score },
    } as any,
    res
  );
  return res;
}

async function staffPatch(body: Record<string, unknown>) {
  setAuthUser({ id: STAFF_AUTH });
  const res = makeRes();
  await adminScrimHandler(
    {
      method: 'PATCH',
      headers: { host: 'h', authorization: bearer() },
      query: { scrimId: SCRIM_ID },
      body,
    } as any,
    res
  );
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  seed();
});

describe('scrim rouvert par le staff : les reports sont purgés', () => {
  it('SCÉNARIO : completed → scheduled, la gagnante renvoie son 2-0 → pas de re-clôture', async () => {
    await report(CAPTAIN_A, 2, 0);
    expect((await report(CAPTAIN_B, 2, 0)).body.outcome).toBe('completed');
    expect(store.scrim_score_reports).toHaveLength(2);

    const reopened = await staffPatch({ status: 'scheduled' });
    expect(reopened.statusCode).toBe(200);
    expect(scrim().status).toBe('scheduled');
    expect(store.scrim_score_reports).toHaveLength(0);
    const log = logStaffActionMock.mock.calls.map((c) => c[0] as any)[0];
    expect(log.payload.purged_reports).toHaveLength(2);

    const replay = await report(CAPTAIN_A, 2, 0);
    expect(replay.body.outcome).toBe('awaiting_opponent');
    expect(scrim().status).toBe('scheduled');
  });

  it('litige remis en planifié : purge aussi', async () => {
    seed({ status: 'disputed' });
    store.scrim_score_reports = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: SCRIM_ID,
        team_side: 1,
        team1_score: 2,
        team2_score: 0,
      },
      {
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: SCRIM_ID,
        team_side: 2,
        team1_score: 0,
        team2_score: 2,
      },
    ] as any;
    expect((await staffPatch({ status: 'scheduled' })).statusCode).toBe(200);
    expect(store.scrim_score_reports).toHaveLength(0);
  });

  it('un PATCH sans changement de statut ne purge rien', async () => {
    store.scrim_score_reports = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: SCRIM_ID,
        team_side: 1,
        team1_score: 2,
        team2_score: 0,
      },
    ] as any;
    expect((await staffPatch({ name: 'Renommé' })).statusCode).toBe(200);
    expect(store.scrim_score_reports).toHaveLength(1);
  });
});

describe('scrim : pas de report avant l’horaire', () => {
  it('409 SCRIM_NOT_STARTED sur un scrim planifié demain, rien d’écrit', async () => {
    seed({ scheduled_date: new Date(Date.now() + 86_400_000).toISOString() });
    const res = await report(CAPTAIN_A, 2, 0);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SCRIM_NOT_STARTED');
    expect(store.scrim_score_reports).toHaveLength(0);
  });

  it('scrim `running` : reportable quel que soit l’horaire', async () => {
    seed({
      status: 'running',
      scheduled_date: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect((await report(CAPTAIN_A, 2, 0)).statusCode).toBe(200);
  });
});
