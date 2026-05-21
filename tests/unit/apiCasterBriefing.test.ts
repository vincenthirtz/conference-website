// Security-critical test for /api/caster/briefing/[matchId].
//
// Goal : a caster connected to tenant X must NOT be able to load briefing
// data for a match that belongs to tenant Y. The endpoint must return 404
// (not 403) to avoid leaking the existence of cross-tenant matches.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import casterBriefingHandler from '../../pages/api/caster/briefing/[matchId]';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';

// V4-compatible UUIDs : version nibble = 4, variant nibble in [8,9,a,b].
const MATCH_X = '11111111-1111-4111-8111-11111111aaaa';
const MATCH_Y = '11111111-1111-4111-8111-11111111bbbb';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-caster-x',
    email: 'caster@x.com',
    role: 'caster',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `tk-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    cookies: {},
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-caster-x' });
  store.staff = [makeStaffRow()] as any;

  // Cast member linking the staff user to TENANT_X only.
  store.cast_members = [
    {
      id: 'cast-1',
      auth_user_id: 'user-caster-x',
      tenant_id: TENANT_X,
      is_active: true,
      name: 'Caster X',
      title: null,
      description: null,
      image_url: null,
      twitch_url: null,
      city: null,
    },
  ] as any;

  // Match in TENANT_X (owned by the caster's tenant).
  store.matches = [
    {
      id: MATCH_X,
      tenant_id: TENANT_X,
      status: 'pending',
      match_format: 'bo3',
      round_name: 'Final',
      scheduled_at: '2026-05-21T20:00:00.000Z',
      team1_id: 'team-x1',
      team2_id: 'team-x2',
      team1: {
        id: 'team-x1',
        name: 'Alpha',
        short_name: null,
        logo_url: null,
        country: null,
        captain_id: null,
      },
      team2: {
        id: 'team-x2',
        name: 'Beta',
        short_name: null,
        logo_url: null,
        country: null,
        captain_id: null,
      },
      tournament: { id: 't-x', name: 'Tournoi X', slug: 'tx' },
    },
    // Match in TENANT_Y (different tenant — should be invisible to caster X).
    {
      id: MATCH_Y,
      tenant_id: TENANT_Y,
      status: 'pending',
      match_format: 'bo3',
      round_name: 'Final',
      scheduled_at: '2026-05-21T20:00:00.000Z',
      team1_id: 'team-y1',
      team2_id: 'team-y2',
      team1: {
        id: 'team-y1',
        name: 'Gamma',
        short_name: null,
        logo_url: null,
        country: null,
        captain_id: null,
      },
      team2: {
        id: 'team-y2',
        name: 'Delta',
        short_name: null,
        logo_url: null,
        country: null,
        captain_id: null,
      },
      tournament: { id: 't-y', name: 'Tournoi Y', slug: 'ty' },
    },
  ] as any;
});

describe('GET /api/caster/briefing/[matchId] — tenant isolation', () => {
  it('returns 200 when the match belongs to the caster tenant', async () => {
    const res = makeRes();
    await casterBriefingHandler(
      makeAuthedReq({ query: { matchId: MATCH_X } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { match: { id: string } };
    expect(body.match.id).toBe(MATCH_X);
  });

  it('returns 404 when the match belongs to a DIFFERENT tenant (cross-tenant leak protection)', async () => {
    const res = makeRes();
    await casterBriefingHandler(
      makeAuthedReq({ query: { matchId: MATCH_Y } }),
      res
    );

    // Critical: 404, not 403, to avoid leaking the existence of the match.
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user has no active cast_members link', async () => {
    // Remove the cast_members link.
    store.cast_members = [] as any;

    const res = makeRes();
    await casterBriefingHandler(
      makeAuthedReq({ query: { matchId: MATCH_X } }),
      res
    );

    expect(res.statusCode).toBe(403);
    const body = res.body as { code?: string };
    expect(body.code).toBe('CASTER_NOT_LINKED');
  });

  it('returns 400 when matchId is not a UUID', async () => {
    const res = makeRes();
    await casterBriefingHandler(
      makeAuthedReq({ query: { matchId: 'not-a-uuid' } }),
      res
    );

    expect(res.statusCode).toBe(400);
  });
});
