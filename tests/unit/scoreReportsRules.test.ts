// tests/unit/scoreReportsRules.test.ts
//
// Règles pures de utils/matches/scoreReports.ts + constat 3 du lot 1 : le fil
// du match n'annonce « d'accord » que si les deux reports sont ÉGAUX.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeScoreReportState,
  isReportBeforeKickoff,
  isStaffOpenedDispute,
  isScoreValidForBestOf,
  resolveSeriesBestOf,
  scrimTransitionPurgesReports,
} from '../../utils/matches/scoreReports';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import detailHandler from '../../pages/api/player/matches/[matchId]';

describe('resolveSeriesBestOf — représentation réelle du format', () => {
  it.each([
    [null, 'bo1', 1],
    [null, 'bo3', 3],
    [null, 'BO5', 5],
    [null, 'single_map', 1],
    [null, 'map_decider', 1],
    [3, null, 3],
    [5, 'bo5', 5],
  ])('best_of=%j, match_format=%j → %j', (bo, fmt, expected) => {
    expect(resolveSeriesBestOf(bo, fmt)).toBe(expected);
  });

  it.each([
    [null, null],
    [null, ''],
    [null, 'custom'],
    [null, 'bo0'],
    [0, null],
    [2.5, null],
    // Contradiction entre les deux colonnes : on ne tranche pas, pas de borne.
    [3, 'bo5'],
  ])('best_of=%j, match_format=%j → inconnu (null)', (bo, fmt) => {
    expect(resolveSeriesBestOf(bo, fmt)).toBeNull();
  });
});

describe('isScoreValidForBestOf', () => {
  it.each([
    [1, 0, 1],
    [0, 1, 1],
    [2, 0, 3],
    [1, 2, 3],
    [3, 2, 5],
    [0, 3, 5],
    [4, 3, 7],
    // BO pair : victoire nette ou nul N/2-N/2
    [2, 0, 2],
    [1, 1, 2],
    [3, 1, 4],
    [2, 2, 4],
  ])('%i-%i en BO%i : valide', (a, b, bo) => {
    expect(isScoreValidForBestOf(a, b, bo)).toBe(true);
  });

  it.each([
    [0, 0, 1],
    [1, 1, 1],
    [2, 0, 1],
    [3, 3, 3],
    [2, 2, 3],
    [3, 0, 3],
    [1, 0, 3],
    [3, 3, 5],
    [4, 1, 5],
    [2, 1, 2],
    [1, 0, 2],
    [3, 2, 4],
  ])('%i-%i en BO%i : invalide', (a, b, bo) => {
    expect(isScoreValidForBestOf(a, b, bo)).toBe(false);
  });

  it('BO inconnu : tout passe', () => {
    expect(isScoreValidForBestOf(3, 3, null)).toBe(true);
    expect(isScoreValidForBestOf(9, 0, null)).toBe(true);
  });
});

describe('isReportBeforeKickoff', () => {
  const NOW = Date.parse('2026-09-18T19:00:00.000Z');
  it('futur + pas lancé → prématuré', () => {
    expect(
      isReportBeforeKickoff({
        status: 'pending',
        scheduledAt: '2026-09-18T20:00:00.000Z',
        startedStatus: 'ongoing',
        nowMs: NOW,
      })
    ).toBe(true);
  });
  it('lancé → jamais prématuré', () => {
    expect(
      isReportBeforeKickoff({
        status: 'ongoing',
        scheduledAt: '2026-09-20T20:00:00.000Z',
        startedStatus: 'ongoing',
        nowMs: NOW,
      })
    ).toBe(false);
  });
  it.each([
    ['2026-09-18T19:00:00.000Z'],
    ['2026-09-18T18:00:00.000Z'],
    [null],
    ['pas une date'],
  ])('heure %j → pas prématuré', (scheduledAt) => {
    expect(
      isReportBeforeKickoff({
        status: 'pending',
        scheduledAt,
        startedStatus: 'ongoing',
        nowMs: NOW,
      })
    ).toBe(false);
  });
});

describe('scrimTransitionPurgesReports', () => {
  it.each([
    ['completed', 'scheduled'],
    ['completed', 'running'],
    ['completed', 'draft'],
    ['cancelled', 'scheduled'],
    ['disputed', 'scheduled'],
    ['disputed', 'running'],
  ])('%s → %s : purge', (from, to) => {
    expect(scrimTransitionPurgesReports(from, to)).toBe(true);
  });
  it.each([
    ['scheduled', 'running'],
    ['running', 'completed'],
    ['disputed', 'completed'],
    ['completed', 'cancelled'],
    ['completed', 'completed'],
    [null, 'scheduled'],
  ])('%s → %s : pas de purge', (from, to) => {
    expect(scrimTransitionPurgesReports(from, to)).toBe(false);
  });
});

describe('computeScoreReportState — constat 3', () => {
  const r = (a: number, b: number) => ({ team1_score: a, team2_score: b });
  it('deux reports égaux → agreed', () => {
    expect(computeScoreReportState('pending', r(2, 1), r(2, 1))).toBe('agreed');
  });
  it('deux reports DIVERGENTS sur un match pas encore en dispute → disputed', () => {
    expect(computeScoreReportState('pending', r(2, 1), r(1, 2))).toBe(
      'disputed'
    );
  });
  it('statut disputed prime', () => {
    expect(computeScoreReportState('disputed', r(2, 1), r(2, 1))).toBe(
      'disputed'
    );
  });
  it('un seul report', () => {
    expect(computeScoreReportState('pending', r(2, 1), null)).toBe(
      'awaiting_opponent'
    );
    expect(computeScoreReportState('pending', null, r(2, 1))).toBe(
      'awaiting_me'
    );
    expect(computeScoreReportState('pending', null, null)).toBe('none');
  });
});

describe('GET /api/player/matches/[matchId] — « agreed » exige l’égalité', () => {
  const USER_ID = '00000000-0000-0000-0000-0000000000aa';
  const TEAM_ID = '00000000-0000-0000-0000-0000000000bb';
  const OTHER_TEAM_ID = '00000000-0000-0000-0000-0000000000cc';
  const MATCH_ID = '00000000-0000-0000-0000-0000000000ee';

  beforeEach(() => {
    resetSupabaseMock();
    invalidateStaffCache();
    setAuthUser({ id: USER_ID });
    store.teams = [
      { id: TEAM_ID, name: 'Phenix', slug: 'phenix', captain_id: USER_ID },
      { id: OTHER_TEAM_ID, name: 'Avoidgers', slug: 'avoidgers' },
    ] as any;
    store.team_members = [
      { id: 'tm-1', team_id: TEAM_ID, user_id: USER_ID, role: 'player' },
    ] as any;
    store.matches = [
      {
        id: MATCH_ID,
        tournament_id: null,
        // L'UPDATE de dispute a échoué : le statut n'a pas bougé.
        status: 'pending',
        scheduled_at: '2026-09-01T18:00:00.000Z',
        match_format: 'bo3',
        team1_id: TEAM_ID,
        team2_id: OTHER_TEAM_ID,
        team1: { id: TEAM_ID, name: 'Phenix', slug: 'phenix' },
        team2: { id: OTHER_TEAM_ID, name: 'Avoidgers', slug: 'avoidgers' },
        tournament: null,
      },
    ] as any;
  });

  async function getState() {
    const res: any = { statusCode: 200, body: undefined, headers: {} };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    res.setHeader = () => undefined;
    await detailHandler(
      {
        method: 'GET',
        headers: { host: 'h', authorization: `Bearer t-${Math.random()}` },
        query: { matchId: MATCH_ID },
        body: {},
      } as any,
      res
    );
    expect(res.statusCode).toBe(200);
    return res.body.report.state;
  }

  it('reports divergents, statut resté pending → disputed (et non agreed)', async () => {
    store.match_score_reports = [
      { match_id: MATCH_ID, team_side: 1, team1_score: 2, team2_score: 1 },
      { match_id: MATCH_ID, team_side: 2, team1_score: 1, team2_score: 2 },
    ] as any;
    expect(await getState()).toBe('disputed');
  });

  it('reports égaux → agreed', async () => {
    store.match_score_reports = [
      { match_id: MATCH_ID, team_side: 1, team1_score: 2, team2_score: 1 },
      { match_id: MATCH_ID, team_side: 2, team1_score: 2, team2_score: 1 },
    ] as any;
    expect(await getState()).toBe('agreed');
  });
});

describe('isStaffOpenedDispute', () => {
  it('dispute ouverte par le staff : oui', () => {
    expect(
      isStaffOpenedDispute({ status: 'disputed', dispute_opened_by: 'staff-1' })
    ).toBe(true);
  });

  it('dispute automatique (reports divergents, auteur NULL) : non', () => {
    expect(
      isStaffOpenedDispute({ status: 'disputed', dispute_opened_by: null })
    ).toBe(false);
    expect(isStaffOpenedDispute({ status: 'disputed' })).toBe(false);
  });

  it('pas en dispute : non, même avec un auteur resté d’une dispute passée', () => {
    // Une dispute résolue garde `dispute_opened_by` : seul le statut courant
    // compte, sinon un match rejoué resterait verrouillé pour toujours.
    for (const status of ['pending', 'ongoing', 'finished', 'cancelled']) {
      expect(
        isStaffOpenedDispute({ status, dispute_opened_by: 'staff-1' })
      ).toBe(false);
    }
  });
});
