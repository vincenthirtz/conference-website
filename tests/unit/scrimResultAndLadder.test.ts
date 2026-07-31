// Unit tests — résultat de scrim (report concordant / divergent) + classement.
//
// Le report est le prérequis du ladder : sans résultat validé par les DEUX
// équipes, un classement n'a aucune valeur. Ces tests portent donc surtout sur
// la machine à états du report, et sur le fait que le classement ne compte que
// ce qu'il doit compter.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitBotEvent = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: (...args: unknown[]) => emitBotEvent(...args),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import reportHandler from '../../pages/api/player/scrims/[scrimId]/report';
import {
  computeLadder,
  POINTS_WIN,
  POINTS_DRAW,
  type ScrimResultRow,
} from '../../utils/scrims/ladder';
import { winnerFromScores, reportsAgree } from '../../utils/scrims/scrimResult';

const SCRIM_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAPTAIN_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CAPTAIN_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STRANGER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tok}` },
    query: { scrimId: SCRIM_ID },
    body: {},
    ...over,
  };
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

function seed() {
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
      status: 'scheduled',
      ranked: true,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      dispute_reason: null,
      deleted_at: null,
    },
  ] as any;
  store.scrim_score_reports = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  seed();
});

/* -----------------------------------------------------------
 * Helpers purs
 * ---------------------------------------------------------*/

describe('scrimResult — helpers', () => {
  it('déduit le vainqueur, et null en cas de nul', () => {
    expect(winnerFromScores(TEAM_A, TEAM_B, 3, 1)).toBe(TEAM_A);
    expect(winnerFromScores(TEAM_A, TEAM_B, 1, 3)).toBe(TEAM_B);
    expect(winnerFromScores(TEAM_A, TEAM_B, 2, 2)).toBeNull();
  });

  it('compare deux reports sur les DEUX scores', () => {
    const a = { team_side: 1 as const, team1_score: 3, team2_score: 1 };
    expect(reportsAgree(a, { ...a, team_side: 2 })).toBe(true);
    expect(
      reportsAgree(a, { team_side: 2, team1_score: 3, team2_score: 2 })
    ).toBe(false);
  });
});

/* -----------------------------------------------------------
 * POST report
 * ---------------------------------------------------------*/

describe('POST /api/player/scrims/[scrimId]/report', () => {
  it('un seul report : on attend l’adversaire, le scrim ne bouge pas', async () => {
    setAuthUser({ id: CAPTAIN_A });
    const res = makeRes();

    await reportHandler(
      makeReq({ body: { team1Score: 3, team2Score: 1 } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).outcome).toBe('awaiting_opponent');
    const scrim = (store.scrims as any[])[0];
    expect(scrim.status).toBe('scheduled');
    expect(scrim.winner_team_id).toBeNull();
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('deux reports concordants : le scrim est clos avec vainqueur', async () => {
    setAuthUser({ id: CAPTAIN_A });
    await reportHandler(
      makeReq({ body: { team1Score: 3, team2Score: 1 } }),
      makeRes()
    );

    setAuthUser({ id: CAPTAIN_B });
    const res = makeRes();
    await reportHandler(
      makeReq({ body: { team1Score: 3, team2Score: 1 } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).outcome).toBe('completed');
    const scrim = (store.scrims as any[])[0];
    expect(scrim.status).toBe('completed');
    expect(scrim.team1_score).toBe(3);
    expect(scrim.winner_team_id).toBe(TEAM_A);
    expect(scrim.completed_at).toBeTruthy();
    // Le bot annonce la fin de la rencontre.
    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    expect(emitBotEvent.mock.calls[0][0]).toBe('scrim.finished');
  });

  it('deux reports divergents : le scrim passe en litige', async () => {
    setAuthUser({ id: CAPTAIN_A });
    await reportHandler(
      makeReq({ body: { team1Score: 3, team2Score: 1 } }),
      makeRes()
    );

    setAuthUser({ id: CAPTAIN_B });
    const res = makeRes();
    await reportHandler(
      makeReq({ body: { team1Score: 1, team2Score: 3 } }),
      res
    );

    expect((res.body as any).outcome).toBe('disputed');
    const scrim = (store.scrims as any[])[0];
    expect(scrim.status).toBe('disputed');
    expect(scrim.dispute_reason).toMatch(/divergents/i);
    expect(scrim.winner_team_id).toBeNull();
    expect(emitBotEvent).not.toHaveBeenCalled();
  });

  it('une correction qui rejoint l’adversaire referme le litige', async () => {
    setAuthUser({ id: CAPTAIN_A });
    await reportHandler(
      makeReq({ body: { team1Score: 3, team2Score: 1 } }),
      makeRes()
    );
    setAuthUser({ id: CAPTAIN_B });
    await reportHandler(
      makeReq({ body: { team1Score: 1, team2Score: 3 } }),
      makeRes()
    );
    expect((store.scrims as any[])[0].status).toBe('disputed');

    // Alpha reconnaît le score de Bravo : accord, donc clôture.
    setAuthUser({ id: CAPTAIN_A });
    const res = makeRes();
    await reportHandler(
      makeReq({ body: { team1Score: 1, team2Score: 3 } }),
      res
    );

    expect((res.body as any).outcome).toBe('completed');
    const scrim = (store.scrims as any[])[0];
    expect(scrim.status).toBe('completed');
    expect(scrim.winner_team_id).toBe(TEAM_B);
    expect(scrim.dispute_reason).toBeNull();
    // Un seul report par camp : la correction remplace, elle ne s'empile pas.
    expect((store.scrim_score_reports as any[]).length).toBe(2);
  });

  it('403 pour une équipe qui ne participe pas', async () => {
    store.teams = [
      ...(store.teams as any[]),
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Charlie',
        captain_id: STRANGER,
        tenant_id: CONFERENCE_TENANT_ID,
        is_active: true,
      },
    ] as any;
    setAuthUser({ id: STRANGER });
    const res = makeRes();

    await reportHandler(
      makeReq({ body: { team1Score: 3, team2Score: 1 } }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('NOT_PARTICIPANT');
  });

  it('400 sur des scores invalides', async () => {
    setAuthUser({ id: CAPTAIN_A });
    const res = makeRes();
    await reportHandler(
      makeReq({ body: { team1Score: -1, team2Score: 2 } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * Classement
 * ---------------------------------------------------------*/

describe('computeLadder', () => {
  const names = new Map([
    [TEAM_A, { name: 'Alpha', slug: 'alpha', logoUrl: null }],
    [TEAM_B, { name: 'Bravo', slug: 'bravo', logoUrl: null }],
  ]);

  const row = (over: Partial<ScrimResultRow> = {}): ScrimResultRow => ({
    team1_id: TEAM_A,
    team2_id: TEAM_B,
    team1_score: 3,
    team2_score: 1,
    winner_team_id: TEAM_A,
    ...over,
  });

  it('applique le barème victoire / nul / défaite', () => {
    const ladder = computeLadder([row()], names);
    const alpha = ladder.find((r) => r.teamId === TEAM_A)!;
    const bravo = ladder.find((r) => r.teamId === TEAM_B)!;
    expect(alpha.points).toBe(POINTS_WIN);
    expect(alpha.won).toBe(1);
    expect(bravo.points).toBe(0);
    expect(bravo.lost).toBe(1);
    expect(alpha.rank).toBe(1);
  });

  it('compte un nul pour les deux équipes', () => {
    const ladder = computeLadder(
      [row({ team1_score: 2, team2_score: 2, winner_team_id: null })],
      names
    );
    expect(ladder.every((r) => r.points === POINTS_DRAW)).toBe(true);
    expect(ladder.every((r) => r.drawn === 1)).toBe(true);
  });

  it('ignore un scrim incomplet plutôt que de fabriquer une ligne bancale', () => {
    const ladder = computeLadder(
      [
        row({ team2_id: null }),
        row({ team1_score: null, team2_score: null, winner_team_id: null }),
      ],
      names
    );
    expect(ladder).toEqual([]);
  });

  it('départage à points égaux par différence de manches', () => {
    // Alpha bat Bravo 5-0 ; Bravo bat Alpha 2-1 → 3 pts chacun, diff décide.
    const ladder = computeLadder(
      [
        row({ team1_score: 5, team2_score: 0, winner_team_id: TEAM_A }),
        row({ team1_score: 1, team2_score: 2, winner_team_id: TEAM_B }),
      ],
      names
    );
    expect(ladder[0].teamId).toBe(TEAM_A);
    expect(ladder[0].scoreDiff).toBe(4);
    expect(ladder[1].scoreDiff).toBe(-4);
  });
});
