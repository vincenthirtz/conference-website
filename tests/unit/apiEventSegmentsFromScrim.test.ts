// Tests for POST /api/admin/events/[runId]/segments/from-scrim
// (feature run-of-show — pré-remplissage de la timeline depuis un SCRIM).
//
// Pendant de `apiEventSegmentsFromTournament.test.ts`. Ce qui diffère du
// tournoi, et que ces tests couvrent spécifiquement :
//   - l'ordre est horaire → création → id (un scrim n'a ni stage ni round) ;
//   - les deux équipes ne changent pas d'un match à l'autre, donc les titres
//     sont numérotés « A vs B — Match N » dès qu'il y en a plus d'un ;
//   - un match annulé du scrim n'entre pas dans la timeline.
//
// Covered aussi (parité avec le tournoi) : anti-doublon sur match_id, scrim
// cross-tenant → 404 SCRIM_NOT_FOUND, body invalide → 400 INVALID_PAYLOAD,
// run 'done' → 409 RUN_DONE, run introuvable → 404.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import fromScrimHandler from '../../pages/api/admin/events/[runId]/segments/from-scrim';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(role: 'admin' = 'admin'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
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
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    cookies: {},
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

// V4-compatible UUIDs.
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SCRIM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MATCH_A = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const MATCH_B = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const MATCH_C = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
const MATCH_CANCELLED = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9';
const TEAM_1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const TEAM_2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function seedBase(runStatus: 'draft' | 'live' | 'done' = 'draft') {
  store.event_runs = [
    {
      id: RUN_ID,
      tenant_id: TENANT,
      status: runStatus,
      name: 'Show',
      slug: 'show',
    },
  ] as any;

  store.scrims = [
    { id: SCRIM_ID, tenant_id: TENANT, name: 'Alpha vs Bravo', slug: 'a-vs-b' },
  ] as any;

  store.teams = [
    { id: TEAM_1, tenant_id: TENANT, name: 'Alpha', short_name: 'ALP' },
    { id: TEAM_2, tenant_id: TENANT, name: 'Bravo', short_name: 'BRV' },
  ] as any;

  // Volontairement insérés dans le désordre pour prouver le tri applicatif.
  // B et C n'ont pas d'horaire : ils se rangent après A, départagés par
  // created_at.
  store.matches = [
    {
      id: MATCH_C,
      tenant_id: TENANT,
      scrim_id: SCRIM_ID,
      scheduled_at: null,
      created_at: '2026-05-01T12:00:00.000Z',
      status: 'pending',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
    },
    {
      id: MATCH_B,
      tenant_id: TENANT,
      scrim_id: SCRIM_ID,
      scheduled_at: null,
      created_at: '2026-05-01T09:00:00.000Z',
      status: 'pending',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
    },
    {
      id: MATCH_A,
      tenant_id: TENANT,
      scrim_id: SCRIM_ID,
      scheduled_at: '2026-05-01T16:00:00.000Z',
      created_at: '2026-05-01T08:00:00.000Z',
      status: 'pending',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
    },
    {
      id: MATCH_CANCELLED,
      tenant_id: TENANT,
      scrim_id: SCRIM_ID,
      scheduled_at: '2026-05-01T15:00:00.000Z',
      created_at: '2026-05-01T07:00:00.000Z',
      status: 'cancelled',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
    },
  ] as any;

  store.event_segments = [] as any;
  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * Tests
 * ---------------------------------------------------------*/

describe('POST /api/admin/events/[runId]/segments/from-scrim', () => {
  it('crée un segment par match, ordonné horaire→création, titres numérotés', async () => {
    seedBase('draft');

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      segments: any[];
      created: number;
      skipped: number;
    };

    // Le match annulé est exclu : 3 segments, pas 4.
    expect(body.created).toBe(3);
    expect(body.skipped).toBe(0);
    expect(body.segments).toHaveLength(3);

    // A a un horaire → premier. B et C n'en ont pas → départagés par created_at.
    expect(body.segments.map((s) => s.match_id)).toEqual([
      MATCH_A,
      MATCH_B,
      MATCH_C,
    ]);
    expect(body.segments.map((s) => s.ord)).toEqual([0, 1, 2]);
    expect(body.segments.every((s) => s.type === 'match')).toBe(true);
    expect(body.segments.every((s) => s.status === 'upcoming')).toBe(true);

    // Série entre deux mêmes équipes → titres numérotés, pas « A vs B » x3.
    expect(body.segments.map((s) => s.title)).toEqual([
      'Alpha vs Bravo — Match 1',
      'Alpha vs Bravo — Match 2',
      'Alpha vs Bravo — Match 3',
    ]);
  });

  it('ne numérote pas quand le scrim n’a qu’un seul match', async () => {
    seedBase('draft');
    store.matches = (store.matches as any[]).filter(
      (m) => m.id === MATCH_A
    ) as any;

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { segments: any[]; created: number };
    expect(body.created).toBe(1);
    expect(body.segments[0].title).toBe('Alpha vs Bravo');
  });

  it('retombe sur le nom du scrim quand les équipes ne sont pas résolues', async () => {
    seedBase('draft');
    store.matches = [
      {
        id: MATCH_A,
        tenant_id: TENANT,
        scrim_id: SCRIM_ID,
        scheduled_at: '2026-05-01T16:00:00.000Z',
        created_at: '2026-05-01T08:00:00.000Z',
        status: 'pending',
        team1_id: null,
        team2_id: null,
      },
    ] as any;

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { segments: any[] };
    expect(body.segments[0].title).toBe('Alpha vs Bravo');
  });

  it('empile à la queue et skippe un match déjà présent dans le run', async () => {
    seedBase('draft');
    store.event_segments = [
      {
        id: '99999999-9999-4999-8999-999999999999',
        event_run_id: RUN_ID,
        tenant_id: TENANT,
        ord: 4,
        type: 'match',
        match_id: MATCH_A,
        title: 'Déjà là',
        status: 'upcoming',
      },
    ] as any;

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      segments: any[];
      created: number;
      skipped: number;
    };
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(1);
    expect(body.segments.map((s) => s.match_id)).toEqual([MATCH_B, MATCH_C]);
    // MAX(ord)=4 → on empile en 5, 6.
    expect(body.segments.map((s) => s.ord)).toEqual([5, 6]);
  });

  it('renvoie 200 created=0 quand tous les matchs sont déjà dans le run', async () => {
    seedBase('draft');
    store.event_segments = [MATCH_A, MATCH_B, MATCH_C].map((id, i) => ({
      id: `88888888-8888-4888-8888-88888888888${i}`,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: i,
      type: 'match',
      match_id: id,
      title: 'Déjà là',
      status: 'upcoming',
    })) as any;

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { created: number; skipped: number };
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(3);
  });

  it('404 SCRIM_NOT_FOUND sur un scrim d’un autre tenant', async () => {
    seedBase('draft');
    store.scrims = [
      { id: SCRIM_ID, tenant_id: OTHER_TENANT, name: 'Ailleurs' },
    ] as any;

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect((res.body as { code: string }).code).toBe('SCRIM_NOT_FOUND');
  });

  it('400 INVALID_PAYLOAD quand scrim_id est absent', async () => {
    seedBase('draft');

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({ query: { runId: RUN_ID }, body: {} }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as { code: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('409 RUN_DONE sur un run terminé', async () => {
    seedBase('done');

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as { code: string }).code).toBe('RUN_DONE');
  });

  it('404 quand le run n’existe pas', async () => {
    seedBase('draft');
    store.event_runs = [] as any;

    const res = makeRes();
    await fromScrimHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { scrim_id: SCRIM_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
  });
});
