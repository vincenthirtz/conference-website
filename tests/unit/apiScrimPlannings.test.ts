// tests/unit/apiScrimPlannings.test.ts
// Tests pour la feature « scrim planning » (grille de dispos partagée) :
//   - Admin  : /api/admin/scrim-plannings, /[planningId], /[planningId]/validate
//   - Joueur : /api/teams/scrim-plannings, /[planningId], /[planningId]/availability
//
// Mock supabase in-memory (tests/unit/__helpers__/supabaseMock). Le mock
// supporte déjà `.upsert(onConflict)` et les colonnes jsonb (slots) — aucune
// modification du helper n'a été nécessaire.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));
vi.mock('@/utils/scrimEvents', () => ({
  emitScrimEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/scrimPlanningEvents', () => ({
  emitScrimPlanningEvent: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  slotKeysForHorizon,
  type PlanningConfig,
} from '../../utils/teams/scrimPlanningOverlap';
import { planningConfigFromRow } from '../../utils/teams/scrimPlanningConfig';

import adminListHandler from '../../pages/api/admin/scrim-plannings/index';
import adminDetailHandler from '../../pages/api/admin/scrim-plannings/[planningId]/index';
import adminValidateHandler from '../../pages/api/admin/scrim-plannings/[planningId]/validate';
import playerListHandler from '../../pages/api/teams/scrim-plannings/index';
import playerDetailHandler from '../../pages/api/teams/scrim-plannings/[planningId]/index';
import playerAvailabilityHandler from '../../pages/api/teams/scrim-plannings/[planningId]/availability';

/* -----------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------*/

const PLANNING_ID = '550e8400-e29b-41d4-a716-4466554400a1';
const PLANNING_ID_2 = '550e8400-e29b-41d4-a716-4466554400a2';
const TEAM_A = '550e8400-e29b-41d4-a716-4466554400b1';
const TEAM_B = '550e8400-e29b-41d4-a716-4466554400b2';

// Config de grille compacte : 1 jour, 2 créneaux (20h et 21h Paris).
const PLANNING_ROW = {
  horizon_start: '2026-08-01',
  horizon_days: 1,
  slot_minutes: 60,
  day_start_min: 1200,
  day_end_min: 1320,
  timezone: 'Europe/Paris',
};
const CONFIG: PlanningConfig = planningConfigFromRow(PLANNING_ROW);
const GRID = slotKeysForHorizon(CONFIG);
const SLOT_1 = GRID[0];
const SLOT_2 = GRID[1];
const OUT_OF_GRID = '2020-01-01T00:00:00.000Z';

function basePlanning(over: Record<string, unknown> = {}) {
  return {
    id: PLANNING_ID,
    created_by: 'staff-1',
    team1_id: TEAM_A,
    team2_id: TEAM_B,
    source_demande_id: null,
    scrim_id: null,
    title: 'Phoenix vs Dragons',
    game: 'overwatch',
    status: 'open',
    validated_slot: null,
    is_public: false,
    deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: null,
    ...PLANNING_ROW,
    ...over,
  };
}

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager',
  authUserId = 'user-1'
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: authUserId,
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
  store.teams = [
    { id: TEAM_A, name: 'Phoenix', short_name: 'PHX' },
    { id: TEAM_B, name: 'Dragons', short_name: 'DRG' },
  ] as any;
});

/* -----------------------------------------------------------
 * /api/admin/scrim-plannings
 * ---------------------------------------------------------*/

describe('/api/admin/scrim-plannings', () => {
  it('GET 401 when unauthenticated', async () => {
    setAuthUser(null);
    const res = makeRes();
    await adminListHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 403 when below manager', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    const res = makeRes();
    await adminListHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('POST creates a planning and GET lists it', async () => {
    const resCreate = makeRes();
    await adminListHandler(
      makeAuthedReq({
        method: 'POST',
        body: { team1_id: TEAM_A, team2_id: TEAM_B, title: 'Test session' },
      }),
      resCreate
    );
    expect(resCreate.statusCode).toBe(201);
    expect((resCreate.body as any).planning.status).toBe('open');
    expect((resCreate.body as any).planning.horizon_days).toBe(21);
    expect(store.scrim_plannings).toHaveLength(1);

    const resList = makeRes();
    await adminListHandler(makeAuthedReq({ method: 'GET' }), resList);
    expect(resList.statusCode).toBe(200);
    expect((resList.body as any).plannings).toHaveLength(1);
  });

  it('POST 400 when team1 == team2', async () => {
    const res = makeRes();
    await adminListHandler(
      makeAuthedReq({
        method: 'POST',
        body: { team1_id: TEAM_A, team2_id: TEAM_A },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on invalid horizon_days', async () => {
    const res = makeRes();
    await adminListHandler(
      makeAuthedReq({
        method: 'POST',
        body: { team1_id: TEAM_A, team2_id: TEAM_B, horizon_days: 99 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/admin/scrim-plannings/[planningId]
 * ---------------------------------------------------------*/

describe('/api/admin/scrim-plannings/[planningId]', () => {
  beforeEach(() => {
    store.scrim_plannings = [basePlanning()] as any;
  });

  it('GET returns planning + availabilities + full-attribution heatmap', async () => {
    store.scrim_planning_availabilities = [
      {
        id: 'av1',
        planning_id: PLANNING_ID,
        party: 'team1',
        user_id: 'u-a',
        display_name: 'Alice',
        slots: [SLOT_1],
      },
    ] as any;
    const res = makeRes();
    await adminDetailHandler(
      makeAuthedReq({ method: 'GET', query: { planningId: PLANNING_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).planning.id).toBe(PLANNING_ID);
    expect((res.body as any).availabilities).toHaveLength(1);
    // Admin heatmap keeps participant attribution (display_name).
    const cell = (res.body as any).heatmap[SLOT_1];
    expect(cell.count).toBe(1);
    expect(cell.participants[0].displayName).toBe('Alice');
  });

  it('GET 404 when not found', async () => {
    const res = makeRes();
    await adminDetailHandler(
      makeAuthedReq({ method: 'GET', query: { planningId: PLANNING_ID_2 } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('PATCH updates allowed fields', async () => {
    const res = makeRes();
    await adminDetailHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { planningId: PLANNING_ID },
        body: { status: 'cancelled', is_public: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).planning.status).toBe('cancelled');
    expect((res.body as any).planning.is_public).toBe(true);
  });

  it('PATCH 400 on non-patchable status (validated)', async () => {
    const res = makeRes();
    await adminDetailHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { planningId: PLANNING_ID },
        body: { status: 'validated' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE soft-deletes', async () => {
    const res = makeRes();
    await adminDetailHandler(
      makeAuthedReq({ method: 'DELETE', query: { planningId: PLANNING_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.scrim_plannings).toHaveLength(1);
    expect((store.scrim_plannings[0] as any).deleted_at).toBeTruthy();
  });
});

/* -----------------------------------------------------------
 * /api/admin/scrim-plannings/[planningId]/validate
 * ---------------------------------------------------------*/

describe('/api/admin/scrim-plannings/[planningId]/validate', () => {
  beforeEach(() => {
    store.scrim_plannings = [basePlanning()] as any;
    store.scrims = [];
  });

  it('creates a scheduled scrim and marks the planning validated', async () => {
    const res = makeRes();
    await adminValidateHandler(
      makeAuthedReq({
        method: 'POST',
        query: { planningId: PLANNING_ID },
        body: { slot: SLOT_1 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).scrim.status).toBe('scheduled');
    expect((res.body as any).scrim.scheduled_date).toBe(SLOT_1);
    expect((res.body as any).scrim.source_planning_id).toBe(PLANNING_ID);
    expect((res.body as any).scrim.name).toBe('Phoenix vs Dragons');
    expect((res.body as any).planning.status).toBe('validated');
    expect((res.body as any).planning.scrim_id).toBe(
      (res.body as any).scrim.id
    );
    expect(store.scrims).toHaveLength(1);
  });

  it('is idempotent: second call returns the same scrim, no duplicate', async () => {
    const res1 = makeRes();
    await adminValidateHandler(
      makeAuthedReq({
        method: 'POST',
        query: { planningId: PLANNING_ID },
        body: { slot: SLOT_1 },
      }),
      res1
    );
    expect(res1.statusCode).toBe(201);
    const scrimId = (res1.body as any).scrim.id;

    const res2 = makeRes();
    await adminValidateHandler(
      makeAuthedReq({
        method: 'POST',
        query: { planningId: PLANNING_ID },
        body: { slot: SLOT_2 },
      }),
      res2
    );
    expect(res2.statusCode).toBe(201);
    expect((res2.body as any).scrim.id).toBe(scrimId);
    expect(store.scrims).toHaveLength(1);
  });

  it('409 when planning is not open', async () => {
    store.scrim_plannings = [basePlanning({ status: 'cancelled' })] as any;
    const res = makeRes();
    await adminValidateHandler(
      makeAuthedReq({
        method: 'POST',
        query: { planningId: PLANNING_ID },
        body: { slot: SLOT_1 },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('400 when slot is out of the grid', async () => {
    const res = makeRes();
    await adminValidateHandler(
      makeAuthedReq({
        method: 'POST',
        query: { planningId: PLANNING_ID },
        body: { slot: OUT_OF_GRID },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('includes a warning when both teams are not available', async () => {
    const res = makeRes();
    await adminValidateHandler(
      makeAuthedReq({
        method: 'POST',
        query: { planningId: PLANNING_ID },
        body: { slot: SLOT_1 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).warning).toBeTruthy();
  });
});

/* -----------------------------------------------------------
 * /api/teams/scrim-plannings/[planningId]/availability  (player PUT)
 * ---------------------------------------------------------*/

describe('/api/teams/scrim-plannings/[planningId]/availability', () => {
  beforeEach(() => {
    store.scrim_plannings = [basePlanning()] as any;
    store.scrim_planning_availabilities = [];
    // No staff by default for player tests.
    store.staff = [] as any;
  });

  function putReq(userId: string, slots: unknown) {
    setAuthUser({ id: userId, user_metadata: { display_name: 'Player' } });
    return makeAuthedReq({
      method: 'PUT',
      query: { planningId: PLANNING_ID },
      body: { slots },
    });
  }

  it('team1 captain can paint slots', async () => {
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    const res = makeRes();
    await playerAvailabilityHandler(putReq('cap-a', [SLOT_1, SLOT_2]), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).mySlots).toEqual([SLOT_1, SLOT_2]);
    expect(store.scrim_planning_availabilities).toHaveLength(1);
    expect((store.scrim_planning_availabilities[0] as any).party).toBe('team1');
  });

  it('team2 captain resolves to party team2', async () => {
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    const res = makeRes();
    await playerAvailabilityHandler(putReq('cap-b', [SLOT_1]), res);
    expect(res.statusCode).toBe(200);
    expect((store.scrim_planning_availabilities[0] as any).party).toBe('team2');
  });

  it('staff (no team) resolves to party staff', async () => {
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    store.staff = [makeStaffRow('caster', 'caster-1')] as any;
    const res = makeRes();
    await playerAvailabilityHandler(putReq('caster-1', [SLOT_1]), res);
    expect(res.statusCode).toBe(200);
    expect((store.scrim_planning_availabilities[0] as any).party).toBe('staff');
  });

  it('403 for an outsider (no team, no staff)', async () => {
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    const res = makeRes();
    await playerAvailabilityHandler(putReq('rando-1', [SLOT_1]), res);
    expect(res.statusCode).toBe(403);
  });

  it('409 when the planning is not open', async () => {
    store.scrim_plannings = [basePlanning({ status: 'validated' })] as any;
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    const res = makeRes();
    await playerAvailabilityHandler(putReq('cap-a', [SLOT_1]), res);
    expect(res.statusCode).toBe(409);
  });

  it('400 on out-of-grid slot', async () => {
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    const res = makeRes();
    await playerAvailabilityHandler(putReq('cap-a', [OUT_OF_GRID]), res);
    expect(res.statusCode).toBe(400);
  });

  it('upsert replaces the previous slot set', async () => {
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;

    const res1 = makeRes();
    await playerAvailabilityHandler(putReq('cap-a', [SLOT_1, SLOT_2]), res1);
    expect(res1.statusCode).toBe(200);

    const res2 = makeRes();
    await playerAvailabilityHandler(putReq('cap-a', [SLOT_1]), res2);
    expect(res2.statusCode).toBe(200);
    expect(store.scrim_planning_availabilities).toHaveLength(1);
    expect((store.scrim_planning_availabilities[0] as any).slots).toEqual([
      SLOT_1,
    ]);
  });
});

/* -----------------------------------------------------------
 * /api/teams/scrim-plannings/[planningId]  (player GET detail)
 * ---------------------------------------------------------*/

describe('/api/teams/scrim-plannings/[planningId] (player)', () => {
  beforeEach(() => {
    store.staff = [] as any;
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    store.scrim_plannings = [basePlanning()] as any;
    store.scrim_planning_availabilities = [
      {
        id: 'av1',
        planning_id: PLANNING_ID,
        party: 'team1',
        user_id: 'cap-a',
        display_name: 'Alice',
        slots: [SLOT_1],
      },
      {
        id: 'av2',
        planning_id: PLANNING_ID,
        party: 'team2',
        user_id: 'cap-b',
        display_name: 'Bob',
        slots: [SLOT_1],
      },
    ] as any;
  });

  it('403 for an outsider', async () => {
    setAuthUser({ id: 'rando-1' });
    const res = makeRes();
    await playerDetailHandler(
      makeAuthedReq({ method: 'GET', query: { planningId: PLANNING_ID } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('heatmap omits displayName / participant attribution', async () => {
    setAuthUser({ id: 'cap-a' });
    const res = makeRes();
    await playerDetailHandler(
      makeAuthedReq({ method: 'GET', query: { planningId: PLANNING_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).myParty).toBe('team1');
    expect((res.body as any).mySlots).toEqual([SLOT_1]);
    const cell = (res.body as any).heatmap[SLOT_1];
    expect(cell.count).toBe(2);
    expect(cell.parties).toEqual(expect.arrayContaining(['team1', 'team2']));
    // No leak of who painted what.
    expect(cell.participants).toBeUndefined();
  });
});

/* -----------------------------------------------------------
 * /api/teams/scrim-plannings  (player list)
 * ---------------------------------------------------------*/

describe('/api/teams/scrim-plannings (player list)', () => {
  beforeEach(() => {
    store.staff = [] as any;
    store.teams = [
      { id: TEAM_A, name: 'Phoenix', captain_id: 'cap-a' },
      { id: TEAM_B, name: 'Dragons', captain_id: 'cap-b' },
    ] as any;
    store.scrim_plannings = [
      basePlanning(),
      basePlanning({ id: PLANNING_ID_2, team1_id: TEAM_A, team2_id: TEAM_B }),
    ] as any;
  });

  it('captain sees sessions of their team with myParty', async () => {
    setAuthUser({ id: 'cap-a' });
    const res = makeRes();
    await playerListHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const list = (res.body as any).plannings;
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].myParty).toBe('team1');
  });

  it('outsider gets an empty list', async () => {
    setAuthUser({ id: 'rando-1' });
    const res = makeRes();
    await playerListHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).plannings).toEqual([]);
  });
});
