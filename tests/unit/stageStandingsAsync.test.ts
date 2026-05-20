import { describe, it, expect, vi, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import {
  computeStageStandings,
  computeGroupedStandings,
} from '../../utils/stages/standings';
import { invalidateAllStandingsCache } from '../../utils/stages/standingsCache';

// Tenant test constant — la valeur exacte importe peu, le mock supabase ne
// filtre pas reellement par tenant_id ; on verifie juste la signature.
const TEST_TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

/* -----------------------------------------------------------
 * Helpers — produce shapes matching what Supabase returns after the join
 * ---------------------------------------------------------*/

function seedStageTeams(
  stageId: string,
  rows: { team_id: string; seed?: number | null; name?: string }[]
) {
  store.stage_teams = rows.map((r) => ({
    stage_id: stageId,
    team_id: r.team_id,
    seed: r.seed ?? null,
    // The mock doesn't perform joins; the production query selects
    // `team:teams(id, name, short_name)`, so the joined object lives on the row.
    team: { id: r.team_id, name: r.name ?? r.team_id, short_name: null },
  })) as any;
}

type MatchSeed = {
  id: string;
  stage_id: string;
  status?: string;
  is_bye?: boolean | null;
  round_number?: number | null;
  team1_id?: string | null;
  team2_id?: string | null;
  winner_team_id?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
  group_key?: string | null;
};

function seedMatches(rows: MatchSeed[]) {
  store.matches = rows.map((r) => ({
    status: 'finished',
    is_bye: false,
    round_number: 1,
    team1_id: null,
    team2_id: null,
    winner_team_id: null,
    team1_score: null,
    team2_score: null,
    group_key: null,
    ...r,
  })) as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateAllStandingsCache();
});

/* -----------------------------------------------------------
 * computeStageStandings — dispatcher
 * ---------------------------------------------------------*/

describe('computeStageStandings — dispatcher', () => {
  it('returns an empty array when the stage has no teams', async () => {
    seedStageTeams('stage-x', []);
    seedMatches([]);
    expect(await computeStageStandings(TEST_TENANT, 'stage-x', 'group')).toEqual([]);
  });

  it('dispatches to group computation for stage_type=group', async () => {
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha' },
      { team_id: 't2', name: 'Beta' },
    ]);
    seedMatches([
      {
        id: 'm1',
        stage_id: 's1',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      },
    ]);

    const standings = await computeStageStandings(TEST_TENANT, 's1', 'group');
    expect(standings[0].teamId).toBe('t1');
    expect(standings[0].wins).toBe(1);
    expect(standings[1].teamId).toBe('t2');
    expect(standings[1].losses).toBe(1);
  });

  it('dispatches to round_robin (same path as group)', async () => {
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha' },
      { team_id: 't2', name: 'Beta' },
    ]);
    seedMatches([
      {
        id: 'm1',
        stage_id: 's1',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't2',
        team1_score: 0,
        team2_score: 1,
      },
    ]);

    const standings = await computeStageStandings(TEST_TENANT, 's1', 'round_robin');
    expect(standings[0].teamId).toBe('t2');
  });

  it('dispatches to bracket computation', async () => {
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha', seed: 1 },
      { team_id: 't2', name: 'Beta', seed: 2 },
    ]);
    seedMatches([
      {
        id: 'm-final',
        stage_id: 's1',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        round_number: 2,
      },
    ]);

    const standings = await computeStageStandings(TEST_TENANT, 's1', 'bracket');
    expect(standings[0].teamId).toBe('t1');
    expect(standings[0].score).toBe(2); // lastWinRound = 2
  });

  it('dispatches to swiss computation', async () => {
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha', seed: 1 },
      { team_id: 't2', name: 'Beta', seed: 2 },
    ]);
    seedMatches([
      {
        id: 'm1',
        stage_id: 's1',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        round_number: 1,
      },
    ]);

    const standings = await computeStageStandings(TEST_TENANT, 's1', 'swiss');
    expect(standings[0].teamId).toBe('t1');
    expect(standings[0].wins).toBeGreaterThanOrEqual(1);
  });

  it('falls back to seed-only ordering for unknown stage types', async () => {
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha', seed: 5 },
      { team_id: 't2', name: 'Beta', seed: 1 },
      { team_id: 't3', name: 'Gamma', seed: 3 },
    ]);
    seedMatches([]);

    const standings = await computeStageStandings(TEST_TENANT, 's1', 'showmatch');
    expect(standings.map((s) => s.teamId)).toEqual(['t2', 't3', 't1']);
    for (const s of standings) {
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
    }
  });

  it('caches swiss standings on a second call (no second matches query)', async () => {
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha', seed: 1 },
      { team_id: 't2', name: 'Beta', seed: 2 },
    ]);
    seedMatches([
      {
        id: 'm1',
        stage_id: 's1',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        round_number: 1,
      },
    ]);

    const first = await computeStageStandings(TEST_TENANT, 's1', 'swiss');

    // Wipe the matches table so a cache miss would clearly produce different output
    store.matches = [];
    const second = await computeStageStandings(TEST_TENANT, 's1', 'swiss');

    expect(second).toEqual(first);
  });

  it('excludes cancelled matches from the standings', async () => {
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha' },
      { team_id: 't2', name: 'Beta' },
    ]);
    seedMatches([
      {
        id: 'm1',
        stage_id: 's1',
        status: 'cancelled',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        team1_score: 9,
        team2_score: 0,
      },
    ]);

    const standings = await computeStageStandings(TEST_TENANT, 's1', 'group');
    // Cancelled match must not contribute to wins
    for (const s of standings) {
      expect(s.wins).toBe(0);
    }
  });
});

/* -----------------------------------------------------------
 * computeGroupedStandings
 * ---------------------------------------------------------*/

describe('computeGroupedStandings', () => {
  it('throws when the stage does not exist', async () => {
    store.tournament_stages = [] as any;
    await expect(computeGroupedStandings(TEST_TENANT, 'missing')).rejects.toThrow(
      /not found/
    );
  });

  it('splits teams by group_assignments and computes per-group standings', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        stage_type: 'group',
        settings: { group_assignments: { A: ['t1', 't2'], B: ['t3', 't4'] } },
      },
    ] as any;
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha' },
      { team_id: 't2', name: 'Beta' },
      { team_id: 't3', name: 'Gamma' },
      { team_id: 't4', name: 'Delta' },
    ]);
    seedMatches([
      {
        id: 'mA',
        stage_id: 's1',
        group_key: 'A',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      },
      {
        id: 'mB',
        stage_id: 's1',
        group_key: 'B',
        team1_id: 't3',
        team2_id: 't4',
        winner_team_id: 't4',
        team1_score: 0,
        team2_score: 1,
      },
    ]);

    const out = await computeGroupedStandings(TEST_TENANT, 's1');
    expect(Object.keys(out.groups).sort()).toEqual(['A', 'B']);
    expect(out.groups.A[0].teamId).toBe('t1');
    expect(out.groups.A[0].groupKey).toBe('A');
    expect(out.groups.B[0].teamId).toBe('t4');
    expect(out.unassigned).toEqual([]);
  });

  it('falls back to inferring groups from match.group_key when settings is empty', async () => {
    store.tournament_stages = [
      { id: 's1', stage_type: 'group', settings: {} },
    ] as any;
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha' },
      { team_id: 't2', name: 'Beta' },
    ]);
    seedMatches([
      {
        id: 'm1',
        stage_id: 's1',
        group_key: 'A',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        team1_score: 1,
        team2_score: 0,
      },
    ]);

    const out = await computeGroupedStandings(TEST_TENANT, 's1');
    expect(out.groups.A).toHaveLength(2);
    expect(out.unassigned).toEqual([]);
  });

  it('places teams without a group into the unassigned bucket', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        stage_type: 'group',
        settings: { group_assignments: { A: ['t1'] } },
      },
    ] as any;
    seedStageTeams('s1', [
      { team_id: 't1', name: 'Alpha' },
      { team_id: 't2', name: 'Beta' }, // not in any group
    ]);
    seedMatches([]);

    const out = await computeGroupedStandings(TEST_TENANT, 's1');
    expect(out.groups.A.map((s) => s.teamId)).toEqual(['t1']);
    expect(out.unassigned.map((s) => s.teamId)).toEqual(['t2']);
    expect(out.unassigned[0].groupKey).toBeNull();
  });
});
