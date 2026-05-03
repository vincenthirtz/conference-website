// Sweep 2g: pages/api/admin/stages/[stageId]/generate-swiss-round.ts (~700 lines).
//
// The handler is heavy: validates state, computes Swiss standings + eliminations,
// then either dry-runs or inserts a new round of matches.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import generateSwissRoundHandler from '../../pages/api/admin/stages/[stageId]/generate-swiss-round';

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

const STAGE = '11111111-1111-1111-1111-111111111111';
const TOUR = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

describe('/api/admin/stages/[stageId]/generate-swiss-round', () => {
  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on GET', async () => {
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'GET', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('404 when stage missing', async () => {
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when stage is not swiss', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'bracket',
        name: 'BR',
        settings: null,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when no stage_teams', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when roundNumber <= max existing round', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 2,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        team1_score: 1,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: { roundNumber: 2 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when nextRound > total_rounds setting', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: { total_rounds: 2 },
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 2,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        team1_score: 1,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: { roundNumber: 3 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toContain('total_rounds');
  });

  it('400 when current round has unfinished matches', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'pending',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tB',
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 generates a first round (no past matches)', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
      { stage_id: STAGE, team_id: 'tC', seed: 3 },
      { stage_id: STAGE, team_id: 'tD', seed: 4 },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.roundNumber).toBe(1);
    expect(body.createdMatches?.length).toBe(2);
    expect((store.matches as any[]).length).toBe(2);
    expect((store.staff_logs as any[]).length).toBe(1);
  });

  it('200 inserts a BYE match for odd participants', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
      { stage_id: STAGE, team_id: 'tC', seed: 3 },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).byeMatchId).toBeTruthy();
    // 2 matches: 1 normal, 1 bye
    expect((res.body as any).createdMatches.length).toBe(2);
  });

  it('409 REMATCHES_REQUIRE_CONFIRMATION when pairing has rematches without acceptRematches', async () => {
    // 2 equipes ayant deja joue : le solveur ne peut pas eviter le rematch.
    // Le back doit refuser l'insert sans acceptRematches=true.
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
    ] as any;
    // Round 1 deja joue entre tA et tB
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        team1_score: 1,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: { roundNumber: 2 },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).detail).toBe('REMATCHES_REQUIRE_CONFIRMATION');
    // Aucun match cree
    expect((store.matches as any[]).length).toBe(1);
  });

  it('200 inserts rematches when acceptRematches=true is passed', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        team1_score: 1,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: { roundNumber: 2, acceptRematches: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).hasRematches).toBe(true);
    // Le rematch a ete cree (round 1 + round 2)
    expect((store.matches as any[]).length).toBe(2);
  });

  it('200 dryRun returns preview without inserts', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
    ] as any;
    store.teams = [
      { id: 'tA', name: 'Alpha', short_name: 'A' },
      { id: 'tB', name: 'Beta', short_name: 'B' },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: { dryRun: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.dryRun).toBe(true);
    expect(body.preview).toBeDefined();
    expect(body.preview.length).toBe(1);
    // No matches inserted
    expect(store.matches?.length ?? 0).toBe(0);
  });

  it('200 stage completed when win_threshold leaves <= 1 active', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: { win_threshold: 1, loss_threshold: 1 },
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
    ] as any;
    // Round 1: tA beats tB → tA wins=1 (eliminated by win_threshold), tB losses=1
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        team1_score: 3,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).stageCompleted).toBe(true);
    expect((res.body as any).eliminatedTeams.length).toBeGreaterThan(0);
    // Source stage deactivated
    expect((store.tournament_stages as any[])[0].is_active).toBe(false);
  });

  it('200 eliminates by loss_threshold while keeping >= 2 active', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: { loss_threshold: 1 },
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
      { stage_id: STAGE, team_id: 'tC', seed: 3 },
      { stage_id: STAGE, team_id: 'tD', seed: 4 },
    ] as any;
    // Round 1: tA beats tC, tB beats tD → tC and tD have 1 loss each (eliminated)
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tC',
        winner_team_id: 'tA',
        team1_score: 3,
        team2_score: 0,
      },
      {
        id: 'm2',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tB',
        team2_id: 'tD',
        winner_team_id: 'tB',
        team1_score: 3,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    // Both losers eliminated by loss_threshold
    expect(body.eliminatedTeams?.length).toBe(2);
    expect(
      body.eliminatedTeams.every((t: any) => t.reason === 'loss_threshold')
    ).toBe(true);
    // Round 2 created with the 2 surviving teams
    expect(body.createdMatches.length).toBe(1);
  });

  it('200 partial elimination when keeping 2 active is the binding constraint', async () => {
    // 3 teams, all with 1 loss each (impossible but used to exercise the cap).
    // Set loss_threshold=1 so all 3 are candidates. activeBeforeLossElim=3 so
    // maxEliminations = 3-2 = 1. Only 1 should actually be eliminated.
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: { loss_threshold: 1 },
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
      { stage_id: STAGE, team_id: 'tC', seed: 3 },
    ] as any;
    // Round 1: only tC has 1 loss after the round, but that's not 3 losses…
    // Make 3 matches that cause all 3 teams to record losses:
    //  - tA vs tB (winner tA) → tB +1 loss
    //  - tB vs tC (winner tC) → tB +1 loss (already counted), tC fine
    //  - tA vs tC (winner tC) → tA +1 loss
    // Actually with only 3 teams each round can have 1 match.
    // Use rounds 1+2 to give them all 1 loss:
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        team1_score: 3,
        team2_score: 0,
      },
      {
        id: 'm2',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: true,
        round_number: 1,
        team1_id: 'tC',
        team2_id: null,
        winner_team_id: 'tC',
        team1_score: 1,
        team2_score: 0,
      },
      {
        id: 'm3',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 2,
        team1_id: 'tC',
        team2_id: 'tA',
        winner_team_id: 'tC',
        team1_score: 3,
        team2_score: 0,
      },
      // After round 2 we have:  tA=1L, tB=1L, tC=0L. So only tA and tB get eliminated.
      // activeBeforeLossElim=3, maxEliminations=1 → only 1 team gets cut.
      {
        id: 'm4',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: true,
        round_number: 2,
        team1_id: 'tB',
        team2_id: null,
        winner_team_id: 'tB',
        team1_score: 1,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    // Only 1 loss-threshold elimination (cap), sorted by losses desc.
    const lossElims = (body.eliminatedTeams ?? []).filter(
      (t: any) => t.reason === 'loss_threshold'
    );
    expect(lossElims.length).toBe(1);
  });

  it('200 zero candidates means no elimination cap activates', async () => {
    // No loss_threshold setting at all → no eliminations at all
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
      { stage_id: STAGE, team_id: 'tC', seed: 3 },
      { stage_id: STAGE, team_id: 'tD', seed: 4 },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: 'tA',
        team1_score: 3,
        team2_score: 0,
      },
      {
        id: 'm2',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tC',
        team2_id: 'tD',
        winner_team_id: 'tC',
        team1_score: 3,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE },
        body: { scoreConfig: { win: 5, draw: 2, loss: 0, bye: 3 } },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).eliminatedTeams).toBeUndefined();
    expect((res.body as any).createdMatches.length).toBe(2);
  });

  it('handles a draw past match (winner_team_id null + equal scores)', async () => {
    store.tournament_stages = [
      {
        id: STAGE,
        tournament_id: TOUR,
        stage_type: 'swiss',
        name: 'Swiss',
        settings: null,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE, team_id: 'tA', seed: 1 },
      { stage_id: STAGE, team_id: 'tB', seed: 2 },
      { stage_id: STAGE, team_id: 'tC', seed: 3 },
      { stage_id: STAGE, team_id: 'tD', seed: 4 },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tA',
        team2_id: 'tB',
        winner_team_id: null,
        team1_score: 1,
        team2_score: 1,
      },
      {
        id: 'm2',
        stage_id: STAGE,
        tournament_id: TOUR,
        status: 'finished',
        is_bye: false,
        round_number: 1,
        team1_id: 'tC',
        team2_id: 'tD',
        winner_team_id: null,
        team1_score: 0,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await generateSwissRoundHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).createdMatches.length).toBe(2);
  });
});
