// POST /api/admin/matches/[matchId]/checkin-staff — le staff pointe une équipe
// à sa place (lot A7). Mêmes gardes que le jeton public, sauf l'horaire.

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/matches/[matchId]/checkin-staff';

function makeStaffRow(role: StaffMember['role'] = 'admin'): StaffMember {
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

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: freshBearer() },
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

const M_ID = '11111111-1111-1111-1111-111111111111';
const T1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const T2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REASON = 'Capitaine sans accès au lien, présente sur Discord';

function seedMatch(over: Record<string, unknown> = {}) {
  store.matches = [
    {
      id: M_ID,
      tournament_id: 'tour-1',
      status: 'pending',
      team1_id: T1,
      team2_id: T2,
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      forfeit_processed_at: null,
      // Coup d'envoi PASSÉ : le staff peut quand même pointer.
      scheduled_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      ...over,
    },
  ] as any;
}

async function call(body: Record<string, unknown>, query = { matchId: M_ID }) {
  const res = makeRes();
  await handler(makeReq({ query, body }), res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
});

describe('POST /api/admin/matches/[matchId]/checkin-staff', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET', query: { matchId: M_ID } }), res);
    expect(res.statusCode).toBe(405);
  });

  it('403 without the arbitrate_matches permission (caster)', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    seedMatch();
    const res = await call({ teamSide: 1, reason: REASON });
    expect(res.statusCode).toBe(403);
    expect((store.matches as any[])[0].team1_checked_in_at).toBeNull();
  });

  it('400 invalid matchId', async () => {
    const res = await call(
      { teamSide: 1, reason: REASON },
      { matchId: 'bogus' }
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 invalid teamSide (both is not allowed)', async () => {
    seedMatch();
    const res = await call({ teamSide: 'both', reason: REASON });
    expect(res.statusCode).toBe(400);
  });

  it('400 REASON_REQUIRED when the reason is missing or blank', async () => {
    seedMatch();
    const res = await call({ teamSide: 1, reason: '   ' });
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('REASON_REQUIRED');
    expect((store.matches as any[])[0].team1_checked_in_at).toBeNull();
  });

  it('404 when the match is missing', async () => {
    const res = await call({ teamSide: 1, reason: REASON });
    expect(res.statusCode).toBe(404);
  });

  it('409 CHECKIN_MATCH_CLOSED when the match is finished', async () => {
    seedMatch({ status: 'finished' });
    const res = await call({ teamSide: 1, reason: REASON });
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('CHECKIN_MATCH_CLOSED');
  });

  it('409 CHECKIN_FORFEIT_PROCESSED once the auto-forfeit has run', async () => {
    seedMatch({ forfeit_processed_at: new Date().toISOString() });
    const res = await call({ teamSide: 2, reason: REASON });
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('CHECKIN_FORFEIT_PROCESSED');
    expect((store.matches as any[])[0].team2_checked_in_at).toBeNull();
  });

  it('409 CHECKIN_TEAM_MISSING when the slot is empty', async () => {
    seedMatch({ team2_id: null });
    const res = await call({ teamSide: 2, reason: REASON });
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('CHECKIN_TEAM_MISSING');
  });

  it('200 after kickoff: writes the check-in and a staff log with the reason', async () => {
    seedMatch();
    const res = await call({ teamSide: 1, reason: `  ${REASON}  ` });
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.success).toBe(true);
    expect(body.alreadyCheckedIn).toBe(false);
    expect(body.teamSide).toBe(1);

    const row = (store.matches as any[])[0];
    expect(row.team1_checked_in_at).toBe(body.checkedInAt);
    expect(row.team2_checked_in_at).toBeNull();

    const log = (store.staff_logs as any[]).find((l) => l.action === 'checkin');
    expect(log).toBeDefined();
    expect(log.entity_id).toBe(M_ID);
    expect(log.payload.reason).toBe(REASON);
    expect(log.payload.team_side).toBe(1);
    expect(log.payload.team_id).toBe(T1);
  });

  it('200 idempotent on an already checked-in team: no rewrite, no log', async () => {
    const at = '2026-05-25T10:00:00.000Z';
    seedMatch({ team2_checked_in_at: at });
    const res = await call({ teamSide: 2, reason: REASON });
    expect(res.statusCode).toBe(200);
    expect((res.body as any).alreadyCheckedIn).toBe(true);
    expect((res.body as any).checkedInAt).toBe(at);
    expect((store.matches as any[])[0].team2_checked_in_at).toBe(at);
    expect(
      ((store.staff_logs as any[]) ?? []).some((l) => l.action === 'checkin')
    ).toBe(false);
  });
});
