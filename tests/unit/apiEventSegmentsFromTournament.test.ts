// Tests for POST /api/admin/events/[runId]/segments/from-tournament
// (feature run-of-show — pré-remplissage de la timeline depuis un tournoi).
//
// Covered :
//   - happy path : N matchs → N segments type='match', ordre stage→round→heure
//     respecté, ord empilé à la queue du run, titres « A vs B ».
//   - anti-doublon : un match déjà présent dans un segment du run est skippé.
//   - tournoi cross-tenant → 404 TOURNAMENT_NOT_FOUND.
//   - body invalide (tournament_id absent) → 400 INVALID_PAYLOAD.
//   - run 'done' → 409 RUN_DONE.
//   - run introuvable → 404.

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

import fromTournamentHandler from '../../pages/api/admin/events/[runId]/segments/from-tournament';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(role: 'admin' | 'manager' = 'admin'): StaffMember {
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
const TOURNAMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAGE_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const STAGE_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const MATCH_A = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const MATCH_B = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const MATCH_C = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
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

  store.tournaments = [
    { id: TOURNAMENT_ID, tenant_id: TENANT, name: 'Cup', slug: 'cup' },
  ] as any;

  store.tournament_stages = [
    {
      id: STAGE_1,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_ID,
      order_index: 0,
    },
    {
      id: STAGE_2,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_ID,
      order_index: 1,
    },
  ] as any;

  store.teams = [
    { id: TEAM_1, tenant_id: TENANT, name: 'Alpha', short_name: 'ALP' },
    { id: TEAM_2, tenant_id: TENANT, name: 'Bravo', short_name: 'BRV' },
  ] as any;

  // Volontairement insérés dans le désordre pour prouver le tri applicatif.
  store.matches = [
    {
      id: MATCH_C,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_ID,
      stage_id: STAGE_2,
      round_number: 1,
      scheduled_at: null,
      created_at: '2026-05-01T12:00:00.000Z',
      round_name: 'Grande finale',
      status: 'pending',
      team1_id: null,
      team2_id: null,
    },
    {
      id: MATCH_B,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_ID,
      stage_id: STAGE_1,
      round_number: 2,
      scheduled_at: '2026-05-01T18:00:00.000Z',
      created_at: '2026-05-01T09:00:00.000Z',
      round_name: 'Demi-finale',
      status: 'pending',
      team1_id: null,
      team2_id: null,
    },
    {
      id: MATCH_A,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_ID,
      stage_id: STAGE_1,
      round_number: 1,
      scheduled_at: '2026-05-01T16:00:00.000Z',
      created_at: '2026-05-01T08:00:00.000Z',
      round_name: 'Quart de finale',
      status: 'pending',
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

describe('POST /api/admin/events/[runId]/segments/from-tournament', () => {
  it('crée N segments type=match dans l’ordre stage→round→heure, ord à la queue', async () => {
    seedBase('draft');

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { tournament_id: TOURNAMENT_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      segments: any[];
      created: number;
      skipped: number;
    };
    expect(body.created).toBe(3);
    expect(body.skipped).toBe(0);
    expect(body.segments).toHaveLength(3);

    // Ordre attendu : STAGE_1/round1 (A) < STAGE_1/round2 (B) < STAGE_2 (C).
    expect(body.segments.map((s) => s.match_id)).toEqual([
      MATCH_A,
      MATCH_B,
      MATCH_C,
    ]);
    // ord empilé à la queue (run vide → 0,1,2).
    expect(body.segments.map((s) => s.ord)).toEqual([0, 1, 2]);
    // Tous type='match'.
    expect(body.segments.every((s) => s.type === 'match')).toBe(true);
    // Titre « A vs B » quand les 2 équipes existent, sinon round_name.
    expect(body.segments[0].title).toBe('Alpha vs Bravo');
    expect(body.segments[1].title).toBe('Demi-finale');
    expect(body.segments[2].title).toBe('Grande finale');

    // Persistés dans le store.
    expect((store.event_segments as any[]).length).toBe(3);
  });

  it('empile ord après les segments existants du run', async () => {
    seedBase('live');
    // Segment intro déjà présent en ord=0.
    store.event_segments = [
      {
        id: 'seg-intro',
        event_run_id: RUN_ID,
        tenant_id: TENANT,
        ord: 0,
        type: 'intro',
        match_id: null,
        title: 'Intro',
        status: 'upcoming',
      },
    ] as any;

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { tournament_id: TOURNAMENT_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { segments: any[]; created: number };
    expect(body.created).toBe(3);
    expect(body.segments.map((s) => s.ord)).toEqual([1, 2, 3]);
  });

  it('skippe les matchs déjà présents en segment (anti-doublon)', async () => {
    seedBase('draft');
    // MATCH_A déjà dans un segment du run.
    store.event_segments = [
      {
        id: 'seg-existing',
        event_run_id: RUN_ID,
        tenant_id: TENANT,
        ord: 0,
        type: 'match',
        match_id: MATCH_A,
        title: 'déjà là',
        status: 'upcoming',
      },
    ] as any;

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { tournament_id: TOURNAMENT_ID },
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
    // ord empilé après le segment existant (0) → 1,2.
    expect(body.segments.map((s) => s.ord)).toEqual([1, 2]);
  });

  it('renvoie created=0/skipped=0 quand le tournoi n’a aucun match', async () => {
    seedBase('draft');
    store.matches = [] as any;

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { tournament_id: TOURNAMENT_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { created: number; skipped: number };
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it('404 TOURNAMENT_NOT_FOUND quand le tournoi est d’un autre tenant', async () => {
    seedBase('draft');
    (store.tournaments as any[])[0].tenant_id = OTHER_TENANT;

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { tournament_id: TOURNAMENT_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    const body = res.body as { code?: string };
    expect(body.code).toBe('TOURNAMENT_NOT_FOUND');
    // Aucun segment créé.
    expect((store.event_segments as any[]).length).toBe(0);
  });

  it('400 INVALID_PAYLOAD quand tournament_id est absent', async () => {
    seedBase('draft');

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: {},
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    const body = res.body as { code?: string };
    expect(body.code).toBe('INVALID_PAYLOAD');
  });

  it('409 RUN_DONE quand le run est terminé', async () => {
    seedBase('done');

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: RUN_ID },
        body: { tournament_id: TOURNAMENT_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(409);
    const body = res.body as { code?: string };
    expect(body.code).toBe('RUN_DONE');
  });

  it('404 quand le run n’existe pas', async () => {
    seedBase('draft');
    store.event_runs = [] as any;

    const res = makeRes();
    await fromTournamentHandler(
      makeAuthedReq({
        query: { runId: '99999999-9999-4999-8999-999999999999' },
        body: { tournament_id: TOURNAMENT_ID },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
  });
});
