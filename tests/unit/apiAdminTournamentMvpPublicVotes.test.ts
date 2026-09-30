// Unit tests — GET /api/admin/tournament/[id]/mvp-public-votes (suivi staff
// du vote MVP DU PUBLIC). Jumeau de apiAdminTournamentMvpVotes.test.ts, sur
// les tables du vote public : garde, périmètre tenant, et surtout la règle du
// public — Twitch et Discord S'ADDITIONNENT (là où le vote des équipes fait
// primer Twitch).

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/tournament/[id]/mvp-public-votes';

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
  store.match_public_mvp_polls = [
    {
      tenant_id: TENANT,
      match_id: M1,
      opened_at: '2026-09-21T21:00:00Z',
      closes_at: '2099-01-01T00:00:00Z',
      closed_at: null,
      winner_member_id: null,
      winner_votes: null,
      total_votes: null,
    },
  ] as never;
  // Twitch : Bea 2 — Discord : Ana 3. Avec la règle des ÉQUIPES, Twitch
  // primerait et Bea mènerait ; la règle du PUBLIC additionne : Ana 3, Bea 2.
  store.match_public_mvp_votes = [
    vote(M1, BEA, 'twitch', 'viewer1'),
    vote(M1, BEA, 'twitch', 'viewer2'),
    vote(M1, ANA, 'discord', 'd-111'),
    vote(M1, ANA, 'discord', 'd-222'),
    vote(M1, ANA, 'discord', 'd-444'),
    // Autre tenant : ne doit jamais être compté.
    { ...vote(M1, BEA, 'discord', 'd-999'), tenant_id: OTHER_TENANT },
  ] as never;
  // Le vote des ÉQUIPES ne doit pas fuiter dans ce tableau.
  store.match_mvp_votes = [vote(M1, BEA, 'discord', 'd-777')] as never;
});

describe('GET /api/admin/tournament/[id]/mvp-public-votes', () => {
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

  it('additionne Twitch et Discord, sans les matchs muets, le vote des équipes ni les votants', async () => {
    const res = makeRes();
    await handler(makeReq(), res as never);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      matches: Array<{
        id: string;
        state: string;
        totalVotes: number;
        sources: Array<{ source: string; total: number }>;
        leader: {
          memberId: string | null;
          label?: string;
          source?: string;
          votes?: number;
          total?: number;
        };
      }>;
      totals: { votes: number; openPolls: number };
    };
    expect(body.matches.map((m) => m.id)).toEqual([M1]);
    const m = body.matches[0];
    expect(m.state).toBe('open');
    expect(m.totalVotes).toBe(5);
    expect(m.sources.map((s) => [s.source, s.total])).toEqual([
      ['twitch', 2],
      ['discord', 3],
    ]);
    expect(m.leader).toMatchObject({
      memberId: ANA,
      label: 'Ana',
      source: 'combined',
      votes: 3,
      total: 5,
    });
    expect(body.totals).toMatchObject({ votes: 5, openPolls: 1 });
    expect(JSON.stringify(body)).not.toMatch(/d-\d{3}|viewer\d/);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('liste les matchs sans vote du public — terminés puis à venir — pour les lancer à la main', async () => {
    const M3 = 'aaaaaaaa-0000-4000-8000-000000000003';
    (store.matches as unknown as Array<Record<string, unknown>>).push({
      id: M3,
      tenant_id: TENANT,
      tournament_id: TID,
      round_name: 'J1',
      scheduled_at: '2026-09-21T20:00:00Z',
      status: 'finished',
      team1_id: T2,
      team2_id: T1,
    });
    const res = makeRes();
    await handler(makeReq(), res as never);
    const openable = (
      res.body as { openable: Array<{ id: string; team1Name: string }> }
    ).openable;
    // M1 a déjà un vote. M3 (terminé) passe avant M2 (à venir) : le vote du
    // public s'ouvre aussi sur un match pas encore joué.
    expect(openable.map((m) => m.id)).toEqual([M3, M2]);
    expect(openable[0].team1Name).toBe('Bravo');
  });

  it('une gagnante figée est rendue comme un titre du public (Twitch + Discord)', async () => {
    (
      store.match_public_mvp_polls as unknown as Array<Record<string, unknown>>
    )[0] = {
      ...(
        store.match_public_mvp_polls as unknown as Array<
          Record<string, unknown>
        >
      )[0],
      closed_at: '2026-09-21T21:10:00Z',
      winner_member_id: ANA,
      winner_votes: 3,
      total_votes: 5,
    };
    const res = makeRes();
    await handler(makeReq(), res as never);
    const m = (
      res.body as { matches: Array<{ state: string; winner: unknown }> }
    ).matches[0];
    expect(m.state).toBe('closed');
    expect(m.winner).toMatchObject({
      memberId: ANA,
      source: 'combined',
      votes: 3,
      total: 5,
    });
  });
});
