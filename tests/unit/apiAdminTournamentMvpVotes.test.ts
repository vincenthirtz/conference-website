// Unit tests — GET /api/admin/tournament/[id]/mvp-votes (suivi staff des
// votes MVP). La logique de décompte est testée dans mvpVoteBoard.test.ts ;
// ici : garde, périmètre tenant, assemblage des lectures, rien de nominatif.

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/tournament/[id]/mvp-votes';

const TENANT = CONFERENCE_TENANT_ID;
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const TID = '550e8400-e29b-41d4-a716-446655440000';
const M1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const M2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const ANA = 'bbbbbbbb-0000-4000-8000-000000000001';
const BEA = 'bbbbbbbb-0000-4000-8000-000000000002';

function staff(role: 'owner' | 'admin' | 'caster' = 'caster'): StaffMember {
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

let counter = 0;
function makeReq(over: Record<string, unknown> = {}) {
  counter += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${counter}` },
    query: { id: TID },
    body: {},
    ...over,
  } as never;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
    setHeader(k: string, v: unknown) {
      res.headers[k] = v;
    },
    getHeader(k: string) {
      return res.headers[k];
    },
  };
  return res;
}

const vote = (
  matchId: string,
  memberId: string,
  source: string,
  key: string
) => ({
  tenant_id: TENANT,
  match_id: matchId,
  member_id: memberId,
  source,
  voter_key: key,
});

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staff('caster')] as never;
  store.tournaments = [
    { id: TID, tenant_id: TENANT, name: 'Cup 2026' },
  ] as never;
  store.teams = [
    { id: T1, tenant_id: TENANT, name: 'Alpha' },
    { id: T2, tenant_id: TENANT, name: 'Bravo' },
  ] as never;
  store.team_members = [
    {
      id: ANA,
      tenant_id: TENANT,
      team_id: T1,
      display_name: 'Ana',
      battle_tag: 'Ana#1',
    },
    {
      id: BEA,
      tenant_id: TENANT,
      team_id: T2,
      display_name: null,
      battle_tag: 'Bea#2',
    },
  ] as never;
  store.matches = [
    {
      id: M1,
      tenant_id: TENANT,
      tournament_id: TID,
      round_name: 'J1',
      scheduled_at: '2026-09-21T19:00:00Z',
      status: 'finished',
      team1_id: T1,
      team2_id: T2,
    },
    // Match à venir, sans vote : ne doit pas apparaître.
    {
      id: M2,
      tenant_id: TENANT,
      tournament_id: TID,
      round_name: 'J2',
      scheduled_at: '2026-09-28T19:00:00Z',
      status: 'pending',
      team1_id: T1,
      team2_id: T2,
    },
  ] as never;
  store.match_mvp_polls = [
    {
      tenant_id: TENANT,
      match_id: M1,
      posted_at: '2026-09-21T21:00:00Z',
      closes_at: '2099-01-01T00:00:00Z',
      closed_at: null,
      winner_member_id: null,
      winner_source: null,
      winner_votes: null,
      total_votes: null,
    },
  ] as never;
  store.match_mvp_votes = [
    vote(M1, ANA, 'discord', 'd-111'),
    vote(M1, ANA, 'discord', 'd-222'),
    vote(M1, BEA, 'discord', 'd-333'),
    vote(M1, ANA, 'discord', 'd-444'),
    // Autre tenant : ne doit jamais être compté.
    { ...vote(M1, BEA, 'discord', 'd-999'), tenant_id: OTHER_TENANT },
  ] as never;
});

describe('GET /api/admin/tournament/[id]/mvp-votes', () => {
  it('400 sur un id invalide, 405 hors GET', async () => {
    const bad = makeRes();
    await handler(makeReq({ query: { id: 'nope' } }), bad as never);
    expect(bad.statusCode).toBe(400);

    const post = makeRes();
    await handler(makeReq({ method: 'POST' }), post as never);
    expect(post.statusCode).toBe(405);
  });

  it('404 quand le tournoi est inconnu du tenant', async () => {
    store.tournaments = [
      { id: TID, tenant_id: OTHER_TENANT, name: 'Ailleurs' },
    ] as never;
    const res = makeRes();
    await handler(makeReq(), res as never);
    expect(res.statusCode).toBe(404);
  });

  it('rend le décompte du match voté, sans les matchs muets ni les votants', async () => {
    const res = makeRes();
    await handler(makeReq(), res as never);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      matches: Array<{
        id: string;
        state: string;
        team1Name: string;
        totalVotes: number;
        sources: Array<{
          source: string;
          rows: Array<{ label: string; votes: number }>;
        }>;
        leader: { memberId: string | null; label?: string };
      }>;
      totals: { votes: number; openPolls: number };
    };
    expect(body.matches.map((m) => m.id)).toEqual([M1]);
    const m = body.matches[0];
    expect(m.state).toBe('open');
    expect(m.team1Name).toBe('Alpha');
    expect(m.totalVotes).toBe(4);
    expect(m.sources[0].rows).toEqual([
      expect.objectContaining({ label: 'Ana', votes: 3 }),
      // Sans nom d'affichage, le BattleTag sert de libellé.
      expect.objectContaining({ label: 'Bea#2', votes: 1 }),
    ]);
    expect(m.leader).toMatchObject({ memberId: ANA, label: 'Ana' });
    expect(body.totals).toMatchObject({ votes: 4, openPolls: 1 });
    expect(JSON.stringify(body)).not.toMatch(/d-\d{3}/);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
