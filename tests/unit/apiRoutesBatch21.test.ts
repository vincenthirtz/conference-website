import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

const { logStaffActionMock, importTeamsMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
  importTeamsMock: vi.fn(async (rows: any[]) => ({
    created: rows.length,
    skipped: 0,
    errors: [],
    teams: rows.map((r, i) => ({ id: `team-${i}`, name: r.name })),
  })),
}));

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));
vi.mock('@/utils/teamImport', async () => {
  const real =
    await vi.importActual<typeof import('../../utils/teamImport')>(
      '../../utils/teamImport'
    );
  return {
    ...real,
    importTeams: importTeamsMock,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import cloneStageHandler from '../../pages/api/admin/stages/[stageId]/clone';
import generateGroupMatchesHandler from '../../pages/api/admin/stages/[stageId]/generate-group-matches';
import importCsvHandler from '../../pages/api/admin/teams/import-csv';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
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
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
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
  importTeamsMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

const STAGE_ID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/clone
 * ---------------------------------------------------------*/

describe('POST /api/admin/stages/[stageId]/clone', () => {
  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await cloneStageHandler(
      makeReq({ method: 'POST', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await cloneStageHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('404 when source stage not found', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await cloneStageHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('201 clones a stage without matches', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        name: 'Group A',
        slug: 'group-a',
        stage_type: 'group',
        order_index: 0,
        is_active: true,
        is_public: true,
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        settings: { rounds: 2 },
      },
    ] as any;
    store.matches = [];
    store.stage_teams = [];
    const res = makeRes();
    await cloneStageHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { includeMatches: false, name: 'Group A (clone)' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.stage.name).toBe('Group A (clone)');
    expect(body.stage.is_active).toBe(false);
    expect(body.stage.is_public).toBe(false);
    expect(body.clonedMatchCount).toBe(0);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('201 clones matches when includeMatches=true', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        name: 'Knockout',
        slug: 'knockout',
        stage_type: 'bracket',
        order_index: 0,
        is_active: true,
        is_public: true,
        settings: {},
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_id: 't1',
        team2_id: 't2',
        round_number: 1,
        match_format: 'bo3',
      },
      {
        id: 'm2',
        stage_id: STAGE_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_id: 't3',
        team2_id: 't4',
        round_number: 1,
        match_format: 'bo3',
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: 't1', seed: 1 },
    ] as any;
    const res = makeRes();
    await cloneStageHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { includeMatches: true },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).clonedMatchCount).toBe(2);
    // New matches were inserted (besides the original 2)
    expect((store.matches as any).length).toBe(4);
    // stage_teams cloned too
    expect((store.stage_teams as any).length).toBe(2);
  });

  it('default name uses (copie) suffix', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        name: 'Original',
        slug: 'original',
        stage_type: 'group',
        order_index: 0,
        settings: {},
      },
    ] as any;
    store.matches = [];
    store.stage_teams = [];
    const res = makeRes();
    await cloneStageHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {},
      }),
      res
    );
    expect((res.body as any).stage.name).toMatch(/copie/);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/generate-group-matches
 * ---------------------------------------------------------*/

describe('POST /api/admin/stages/[stageId]/generate-group-matches', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({ method: 'POST', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when stage type not supported', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        stage_type: 'bracket',
        settings: {},
      },
    ] as any;
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when no group_assignments', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        stage_type: 'group',
        settings: {},
      },
    ] as any;
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 when matches already exist', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        stage_type: 'group',
        settings: { group_assignments: { A: ['t1', 't2', 't3'] } },
      },
    ] as any;
    store.matches = [
      { id: 'existing', stage_id: STAGE_ID, status: 'pending' },
    ] as any;
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('200 dry run returns preview without inserting', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        stage_type: 'group',
        settings: { group_assignments: { A: ['t1', 't2', 't3'] } },
      },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { dryRun: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.dryRun).toBe(true);
    expect(body.preview.length).toBeGreaterThan(0);
    expect(body.groupCount).toBe(1);
    expect((store.matches as any).length).toBe(0); // not inserted
  });

  it('200 inserts round-robin matches for each group', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        stage_type: 'group',
        settings: {
          group_assignments: { A: ['t1', 't2'], B: ['t3', 't4'] },
        },
      },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { matchFormat: 'bo5' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.createdMatchIds.length).toBe((store.matches as any).length);
    // For 2 teams in each group with 1 round, we get 1 match per group → 2 total
    expect((store.matches as any).length).toBe(2);
    expect((store.matches as any)[0].match_format).toBe('bo5');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('skips groups with fewer than 2 teams', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        stage_type: 'group',
        settings: {
          group_assignments: {
            A: ['t1'], // too small
            B: ['t2', 't3', 't4'],
          },
        },
      },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await generateGroupMatchesHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { dryRun: true },
      }),
      res
    );
    const body = res.body as any;
    expect(body.groupCount).toBe(1); // only B counted
    // All preview pairings reference group B
    for (const p of body.preview) expect(p.group_key).toBe('B');
  });
});

/* -----------------------------------------------------------
 * /api/admin/teams/import-csv
 * ---------------------------------------------------------*/

describe('POST /api/admin/teams/import-csv', () => {
  beforeEach(() => {
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await importCsvHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when csv field missing', async () => {
    const res = makeRes();
    await importCsvHandler(
      makeReq({ method: 'POST', body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when CSV has no data lines', async () => {
    const res = makeRes();
    await importCsvHandler(
      makeReq({ method: 'POST', body: { csv: 'name,country' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when name column missing', async () => {
    const res = makeRes();
    await importCsvHandler(
      makeReq({
        method: 'POST',
        body: {
          csv: `country,players\nFR,Player#1`,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when too many rows (over MAX_ROWS=200)', async () => {
    // Build 201 rows
    const lines = ['name,country'];
    for (let i = 0; i < 201; i++) lines.push(`Team${i},FR`);
    const res = makeRes();
    await importCsvHandler(
      makeReq({ method: 'POST', body: { csv: lines.join('\n') } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 parses CSV and forwards to importTeams', async () => {
    // Quote the players cell so the parser doesn't treat ';' as a column delimiter.
    const csv = [
      'name,short_name,country,players',
      '"Alpha Wolves",ALW,FR,"Player1#1234;Player2#5678"',
      'Beta Hawks,,BE,SoloPlayer#0001',
    ].join('\n');
    const res = makeRes();
    await importCsvHandler(
      makeReq({
        method: 'POST',
        body: { csv, tournamentId: 'tour-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(importTeamsMock).toHaveBeenCalledOnce();
    const args = importTeamsMock.mock.calls[0] as any[];
    const rows = args[0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alpha Wolves');
    expect(rows[0].short_name).toBe('ALW');
    expect(rows[0].country).toBe('FR');
    expect(rows[0].players).toEqual(['Player1#1234', 'Player2#5678']);
    expect(rows[1].name).toBe('Beta Hawks');
    expect(rows[1].players).toEqual(['SoloPlayer#0001']);
    const opts = args[1] as any;
    expect(opts.tournamentId).toBe('tour-1');
    expect(opts.sourceLabel).toBe('csv_import');
  });

  it('200 supports French aliases for column names', async () => {
    const csv = ['nom,pays,joueurs', 'Hello,FR,P1#1234'].join('\n');
    const res = makeRes();
    await importCsvHandler(
      makeReq({ method: 'POST', body: { csv } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = importTeamsMock.mock.calls[0][0] as any[];
    expect(rows[0].name).toBe('Hello');
    expect(rows[0].country).toBe('FR');
    expect(rows[0].players).toEqual(['P1#1234']);
  });

  it('500 when importTeams throws', async () => {
    importTeamsMock.mockRejectedValueOnce(new Error('db down'));
    const csv = ['name', 'X'].join('\n');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await importCsvHandler(
      makeReq({ method: 'POST', body: { csv } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });
});
