// Soirée de match (18/09) — les routes joueuse qui disaient faux en situation
// réelle : trois matchs à 19:00, 20:30 et 22:00, et une soirée qui prend du
// retard.
//
//   - /api/player/next-match faisait disparaître un match `ongoing` une heure
//     après son horaire, et — si on se contentait de le garder — masquerait le
//     check-in du match suivant (pickNextMatch) ;
//   - /api/player/matches retirait le bloc check-in dès `ongoing`, et ne disait
//     pas qui peut rapporter le score (`canReportScore`).

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import nextMatchHandler from '../../pages/api/player/next-match';
import matchesHandler from '../../pages/api/player/matches';
import { pickNextMatch } from '@/utils/matches/playerMatchView';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const TEAM_ID = '00000000-0000-0000-0000-0000000000bb';
const OTHER_TEAM_ID = '00000000-0000-0000-0000-0000000000cc';
const TOURNAMENT_ID = '00000000-0000-0000-0000-0000000000dd';
const MATCH_1 = '00000000-0000-0000-0000-0000000000e1';
const MATCH_2 = '00000000-0000-0000-0000-0000000000e2';

const MIN = 60_000;

let _bearer = 0;
function makeReq(over: Partial<any> = {}): any {
  _bearer += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_bearer}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function row(over: Record<string, unknown>) {
  return {
    id: MATCH_1,
    tournament_id: TOURNAMENT_ID,
    status: 'pending',
    scheduled_at: new Date(Date.now() + 30 * MIN).toISOString(),
    match_format: 'bo3',
    round_name: 'Round 1',
    stream_url: null,
    team1_id: TEAM_ID,
    team2_id: OTHER_TEAM_ID,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    team1_checkin_token: 'token-team1',
    team2_checkin_token: 'token-team2',
    team1_checked_in_at: null,
    team2_checked_in_at: null,
    team1: { id: TEAM_ID, name: 'Phenix' },
    team2: { id: OTHER_TEAM_ID, name: 'Avoidgers' },
    tournament: { id: TOURNAMENT_ID, name: 'OWWC 2026', slug: 'owwc-2026' },
    ...over,
  };
}

function seedMembership(captainId: string | null = null) {
  store.team_members = [
    { id: 'tm-1', team_id: TEAM_ID, user_id: USER_ID, role: 'player' },
  ];
  store.teams = [
    { id: TEAM_ID, name: 'Phenix', captain_id: captainId },
    { id: OTHER_TEAM_ID, name: 'Avoidgers', captain_id: 'someone-else' },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER_ID });
});

describe('pickNextMatch (pur)', () => {
  const now = new Date('2026-09-18T18:10:00Z').getTime(); // 20:10 Paris
  const m1 = {
    id: 'm1',
    status: 'ongoing',
    scheduled_at: '2026-09-18T17:00:00Z', // 19:00, en retard
    team1_id: 'T',
    team1_checked_in_at: '2026-09-18T16:30:00Z',
  };
  const m2 = {
    id: 'm2',
    status: 'pending',
    scheduled_at: '2026-09-18T18:30:00Z', // 20:30, check-in ouvert
    team1_id: 'T',
    team1_checked_in_at: null,
  };

  it('garde un match en cours plus d’une heure après son horaire', () => {
    expect(pickNextMatch([m1], 'T', now)?.id).toBe('m1');
  });

  it('priorise le check-in ouvert du match suivant sur le match en cours', () => {
    expect(pickNextMatch([m1, m2], 'T', now)?.id).toBe('m2');
  });

  it('revient au match en cours une fois le check-in suivant fait', () => {
    const done = { ...m2, team1_checked_in_at: '2026-09-18T17:40:00Z' };
    expect(pickNextMatch([m1, done], 'T', now)?.id).toBe('m1');
  });

  it('écarte un pending dont l’horaire est passé depuis plus d’une heure', () => {
    const stale = {
      ...m2,
      id: 'old',
      scheduled_at: '2026-09-18T16:00:00Z',
    };
    expect(pickNextMatch([stale], 'T', now)).toBeNull();
  });

  it('dédoublonne un match remonté par les deux requêtes', () => {
    expect(pickNextMatch([m1, m1], 'T', now)?.id).toBe('m1');
  });
});

describe('/api/player/next-match — soirée en retard', () => {
  it('renvoie un match ongoing programmé il y a 70 min', async () => {
    seedMembership();
    store.matches = [
      row({
        status: 'ongoing',
        scheduled_at: new Date(Date.now() - 70 * MIN).toISOString(),
      }),
    ];
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.match?.id).toBe(MATCH_1);
    expect(res.body.match?.status).toBe('ongoing');
  });

  it('préfère le match dont le check-in est ouvert au match en cours', async () => {
    seedMembership();
    store.matches = [
      row({
        status: 'ongoing',
        scheduled_at: new Date(Date.now() - 70 * MIN).toISOString(),
        team1_checked_in_at: new Date(Date.now() - 100 * MIN).toISOString(),
      }),
      row({
        id: MATCH_2,
        scheduled_at: new Date(Date.now() + 20 * MIN).toISOString(),
      }),
    ];
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.match?.id).toBe(MATCH_2);
    expect(res.body.checkin?.isOpen).toBe(true);
  });

  it('écarte toujours un pending passé depuis plus d’une heure', async () => {
    seedMembership();
    store.matches = [
      row({ scheduled_at: new Date(Date.now() - 90 * MIN).toISOString() }),
    ];
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.match).toBeNull();
  });
});

describe('/api/player/matches — check-in et droit de report', () => {
  it('garde le bloc check-in sur un match ongoing', async () => {
    seedMembership();
    store.matches = [
      row({
        status: 'ongoing',
        scheduled_at: new Date(Date.now() - 5 * MIN).toISOString(),
        team1_checked_in_at: new Date(Date.now() - 30 * MIN).toISOString(),
      }),
    ];
    const res = makeRes();
    await matchesHandler(makeReq(), res);
    const m = res.body.matches[0];
    expect(m.checkin).not.toBeNull();
    expect(m.checkin.alreadyCheckedIn).toBe(true);
  });

  it('pas de bloc check-in sur un match terminé', async () => {
    seedMembership();
    store.matches = [row({ status: 'finished' })];
    const res = makeRes();
    await matchesHandler(makeReq(), res);
    expect(res.body.matches[0].checkin).toBeNull();
  });

  it('canReportScore = false pour une joueuse qui n’est pas capitaine', async () => {
    seedMembership('another-user');
    store.matches = [row({ status: 'ongoing' })];
    const res = makeRes();
    await matchesHandler(makeReq(), res);
    expect(res.body.matches[0].canReportScore).toBe(false);
  });

  it('canReportScore = true pour la capitaine (teams.captain_id)', async () => {
    seedMembership(USER_ID);
    store.matches = [row({ status: 'ongoing' })];
    const res = makeRes();
    await matchesHandler(makeReq(), res);
    expect(res.body.matches[0].canReportScore).toBe(true);
  });

  it('canReportScore = false sur un match clôturé ou sans adversaire', async () => {
    seedMembership(USER_ID);
    store.matches = [
      row({ status: 'finished' }),
      row({ id: MATCH_2, team2_id: null, team2: null }),
    ];
    const res = makeRes();
    await matchesHandler(makeReq(), res);
    for (const m of res.body.matches) {
      expect(m.canReportScore).toBe(false);
    }
  });
});
