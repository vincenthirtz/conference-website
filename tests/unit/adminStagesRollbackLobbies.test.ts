// tests/unit/adminStagesRollbackLobbies.test.ts — test minimal des trois
// routes de phase qui n'en avaient aucun avant leur migration en module
// (features/admin/stages) : lobbies FFA, snapshots de bracket, overrides de
// départage. On vérifie la garde des entrées, un chemin nominal et le slug
// de journal (ex-`other` → slug précis, payload inchangé).

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import lobbiesHandler from '../../pages/api/admin/stages/[stageId]/lobbies';
import snapshotsHandler from '../../pages/api/admin/stages/[stageId]/snapshots';
import tiebreakerHandler from '../../pages/api/admin/stages/[stageId]/tiebreaker-override';

const TID = '550e8400-e29b-41d4-a716-446655440000';
const STAGE = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const T1 = '7a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const T2 = '8b2c3d4e-5f6a-4b7c-9d8e-9f0a1b2c3d4e';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function makeReq(over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
    query: { stageId: STAGE },
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

function seedStage(stageType: string) {
  store.tournament_stages = [
    {
      id: STAGE,
      tournament_id: TID,
      name: 'Phase',
      stage_type: stageType,
      order_index: 0,
      settings: {},
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
});

describe('/api/admin/stages/[stageId]/lobbies', () => {
  it('405 + Allow sur une méthode non déclarée', async () => {
    seedStage('ffa');
    const res = makeRes();
    await lobbiesHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET,POST');
  });

  it('400 hors phase FFA', async () => {
    seedStage('bracket');
    const res = makeRes();
    await lobbiesHandler(makeReq(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('This endpoint is only for ffa stages.');
  });

  it('POST crée un lobby (201) ; round_number invalide → 400', async () => {
    seedStage('ffa');
    const bad = makeRes();
    await lobbiesHandler(
      makeReq({ method: 'POST', body: { round_number: 0 } }),
      bad
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toBe('round_number must be a positive integer');

    const res = makeRes();
    await lobbiesHandler(
      makeReq({ method: 'POST', body: { name: ' Lobby A ', round_number: 1 } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.lobby).toMatchObject({ name: 'Lobby A', round_number: 1 });
  });
});

describe('/api/admin/stages/[stageId]/snapshots', () => {
  it('404 si la phase est inconnue', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await snapshotsHandler(makeReq(), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Stage introuvable.');
  });

  it('PATCH sans snapshotId entier → 400', async () => {
    seedStage('bracket');
    const res = makeRes();
    await snapshotsHandler(
      makeReq({ method: 'PATCH', body: { snapshotId: 'x' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('snapshotId (integer) requis.');
  });
});

describe('/api/admin/stages/[stageId]/tiebreaker-override', () => {
  it('POST : équipes identiques → 400', async () => {
    seedStage('group');
    const res = makeRes();
    await tiebreakerHandler(
      makeReq({ method: 'POST', body: { winnerTeamId: T1, loserTeamId: T1 } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('winner et loser doivent être différents.');
  });

  it('POST nominal → 201, journal `set_tiebreaker_override` (payload inchangé)', async () => {
    seedStage('group');
    store.stage_teams = [
      { stage_id: STAGE, team_id: T1, seed: 1 },
      { stage_id: STAGE, team_id: T2, seed: 2 },
    ] as any;
    const res = makeRes();
    await tiebreakerHandler(
      makeReq({
        method: 'POST',
        body: { winnerTeamId: T1, loserTeamId: T2, reason: 'H2H' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const log = (store.staff_logs ?? []).find(
      (l) => l.action === 'set_tiebreaker_override'
    );
    expect(log?.payload).toMatchObject({
      subject: 'tiebreaker_override_set',
      winner_team_id: T1,
      loser_team_id: T2,
      reason: 'H2H',
    });
  });

  it('DELETE sans id entier → 400', async () => {
    seedStage('group');
    const res = makeRes();
    await tiebreakerHandler(makeReq({ method: 'DELETE', body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('id (integer) requis.');
  });
});
