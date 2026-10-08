// tests/unit/standingsWalkover.test.ts — un forfait compte au classement.
//
// `walkover` = match tranché : le vainqueur prend la victoire et les scores
// stockés (2-0) comptent. `cancelled` et les matchs supprimés (`deleted_at`)
// ne comptent jamais. Vérifié sur tous les chemins : poules / round robin,
// suisse, bracket, classement par poule, classement public.

import { describe, it, expect, beforeEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  computeStageStandings,
  computeGroupedStandings,
} from '../../utils/stages/standings';
import { readPublicStandings } from '../../utils/stages/publicStandings';
import { invalidateAllStandingsCache } from '../../utils/stages/standingsCache';
import {
  isCountedMatch,
  isCountedStatus,
} from '../../utils/stages/countedMatches';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = 'tour-1';

function seedTeams(stageId: string, ids: string[]) {
  store.stage_teams = ids.map((id, i) => ({
    stage_id: stageId,
    team_id: id,
    seed: i + 1,
    team: { id, name: id.toUpperCase(), short_name: null, logo_url: null },
  })) as any;
}

function match(over: Record<string, unknown>) {
  return {
    stage_id: 's1',
    status: 'finished',
    is_bye: false,
    round_number: 1,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    group_key: null,
    deleted_at: null,
    scheduled_at: null,
    ...over,
  };
}

/** t2 gagne par forfait 2-0 ; un match annulé et un supprimé donnent t1 gagnante. */
function seedForfeitScenario() {
  store.matches = [
    match({
      id: 'wo',
      status: 'walkover',
      team1_id: 't1',
      team2_id: 't2',
      winner_team_id: 't2',
      team1_score: 0,
      team2_score: 2,
    }),
    match({
      id: 'cancelled',
      status: 'cancelled',
      team1_id: 't1',
      team2_id: 't2',
      winner_team_id: 't1',
      team1_score: 2,
      team2_score: 0,
    }),
    match({
      id: 'deleted',
      team1_id: 't1',
      team2_id: 't2',
      winner_team_id: 't1',
      team1_score: 2,
      team2_score: 0,
      deleted_at: '2026-10-01T00:00:00Z',
    }),
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateAllStandingsCache();
});

describe('countedMatches', () => {
  it('finished et walkover comptent, le reste non', () => {
    expect(isCountedStatus('finished')).toBe(true);
    expect(isCountedStatus('walkover')).toBe(true);
    for (const s of ['cancelled', 'pending', 'ongoing', 'disputed', null]) {
      expect(isCountedStatus(s)).toBe(false);
    }
    expect(isCountedMatch({ status: 'walkover', deleted_at: null })).toBe(true);
    expect(
      isCountedMatch({ status: 'finished', deleted_at: '2026-01-01' })
    ).toBe(false);
  });
});

describe('computeStageStandings — forfaits', () => {
  it.each(['group', 'round_robin'])(
    '%s : le forfait donne la victoire et les maps ; annulé et supprimé ignorés',
    async (type) => {
      seedTeams('s1', ['t1', 't2']);
      seedForfeitScenario();
      const st = await computeStageStandings(TENANT, 's1', type);
      expect(st.map((s) => s.teamId)).toEqual(['t2', 't1']);
      expect(st[0]).toMatchObject({ wins: 1, losses: 0, score: 3 });
      expect(st[1]).toMatchObject({ wins: 0, losses: 1, score: 0 });
    }
  );

  it('swiss : le forfait compte comme une victoire', async () => {
    seedTeams('s1', ['t1', 't2']);
    seedForfeitScenario();
    const st = await computeStageStandings(TENANT, 's1', 'swiss');
    expect(st[0]).toMatchObject({ teamId: 't2', wins: 1, losses: 0 });
    expect(st[1]).toMatchObject({ teamId: 't1', wins: 0, losses: 1 });
  });

  it('bracket : le vainqueur par forfait passe devant', async () => {
    seedTeams('s1', ['t1', 't2']);
    seedForfeitScenario();
    const st = await computeStageStandings(TENANT, 's1', 'bracket');
    expect(st[0]).toMatchObject({ teamId: 't2', wins: 1 });
    expect(st[1]).toMatchObject({ teamId: 't1', losses: 1 });
  });

  it('classement par poule : même règle', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        stage_type: 'group',
        settings: { group_assignments: { A: ['t1', 't2'] } },
      },
    ] as any;
    seedTeams('s1', ['t1', 't2']);
    seedForfeitScenario();
    const out = await computeGroupedStandings(TENANT, 's1');
    expect(out.groups.A.map((s) => s.teamId)).toEqual(['t2', 't1']);
    expect(out.groups.A[0]).toMatchObject({ wins: 1, score: 3 });
  });
});

describe('readPublicStandings — forfaits', () => {
  it('le forfait est un match joué (maps, forme) ; annulé et supprimé non', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: TOURNAMENT,
        name: 'Poule',
        stage_type: 'round_robin',
        order_index: 0,
        settings: {},
      },
    ] as any;
    seedTeams('s1', ['t1', 't2']);
    seedForfeitScenario();
    const tables = await readPublicStandings(TENANT, TOURNAMENT);
    expect(tables).toHaveLength(1);
    const [first, second] = tables[0].rows;
    expect(first).toMatchObject({
      teamId: 't2',
      played: 1,
      wins: 1,
      points: 3,
      mapsWon: 2,
      mapsLost: 0,
      form: ['W'],
    });
    expect(second).toMatchObject({
      teamId: 't1',
      played: 1,
      losses: 1,
      mapsWon: 0,
      mapsLost: 2,
      form: ['L'],
    });
  });
});

describe('runSwissNextRound — une ronde close par forfait', () => {
  it("n'est plus bloquée, et le vainqueur par forfait est apparié aux gagnants", async () => {
    const { runSwissNextRound } = await import(
      '../../utils/swiss/runNextRound'
    );
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: TOURNAMENT,
        name: 'Suisse',
        stage_type: 'swiss',
        settings: {},
      },
    ] as any;
    seedTeams('s1', ['t1', 't2', 't3', 't4']);
    store.matches = [
      match({
        id: 'm1',
        status: 'walkover',
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
      match({
        id: 'm2',
        team1_id: 't3',
        team2_id: 't4',
        winner_team_id: 't3',
        team1_score: 2,
        team2_score: 1,
      }),
    ] as any;

    const out = await runSwissNextRound({
      tenantId: TENANT,
      stageId: 's1',
      dryRun: true,
    } as any);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.roundNumber).toBe(2);
    const winnersPair = out.preview.find(
      (p) => p.team1Id === 't1' || p.team2Id === 't1'
    );
    expect([winnersPair?.team1Id, winnersPair?.team2Id].sort()).toEqual([
      't1',
      't3',
    ]);
  });
});
