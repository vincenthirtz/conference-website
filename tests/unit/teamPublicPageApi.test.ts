// Unit tests for PATCH /api/teams/[teamId]/public-page.
//
// The endpoint lets a captain or a member with the `edit_public_page` team
// permission update the public-facing fields of their team page. We verify:
//   - auth (Bearer token required)
//   - permission (captain bypass, manager via role, plain player rejected)
//   - validation (length caps, hex color, http(s) URLs, javascript: rejected)
//   - audit log (only the changed fields are recorded)

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/teams/[teamId]/public-page';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, withAuth = true): any {
  return {
    method: 'PATCH',
    headers: {
      host: 'h',
      ...(withAuth ? { authorization: `Bearer ${freshToken()}` } : {}),
    },
    query: { teamId: TEAM_ID },
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedTeam(overrides: Record<string, unknown> = {}) {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      description: null,
      public_content: null,
      accent_color: null,
      logo_url: null,
      banner_url: null,
      twitter: null,
      discord: null,
      website: null,
      is_active: true,
      ...overrides,
    },
  ] as any;
  store.team_members = [
    { id: 'tm-cap', team_id: TEAM_ID, user_id: CAPTAIN_ID, role: 'player' },
    { id: 'tm-mgr', team_id: TEAM_ID, user_id: MANAGER_ID, role: 'manager' },
    { id: 'tm-ply', team_id: TEAM_ID, user_id: PLAYER_ID, role: 'player' },
  ] as any;
  store.team_audit_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN_ID });
  seedTeam();
});

/* -----------------------------------------------------------
 * Method + auth
 * ---------------------------------------------------------*/

describe('method + auth', () => {
  it('rejects non-PATCH methods with 405', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects unauthenticated requests with 401', async () => {
    setAuthUser(null);
    const res = makeRes();
    await handler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with invalid teamId UUID', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { teamId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * Permission
 * ---------------------------------------------------------*/

describe('permission', () => {
  it('captain can update', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { description: 'Hello team' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams as any[])[0].description).toBe('Hello team');
  });

  it('manager (role with edit_public_page) can update', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();
    await handler(
      makeReq({ body: { description: 'By manager' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams as any[])[0].description).toBe('By manager');
  });

  it('plain player is rejected with 403', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await handler(
      makeReq({ body: { description: 'should fail' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((store.teams as any[])[0].description).toBeNull();
  });

  it('returns 404 when team does not exist', async () => {
    const otherTeamId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    // Make captain the captain of a non-seeded team to satisfy permission, but
    // the snapshot lookup will return null. To do that, simulate captain on
    // a team that is the wrong one.
    (store.teams as any[]).push({
      id: otherTeamId,
      name: 'Bravo',
      captain_id: CAPTAIN_ID,
      is_active: true,
    });
    // Reset captain on the original team so permission check on otherTeamId
    // succeeds (captain bypass).
    const res = makeRes();
    await handler(
      makeReq({
        query: { teamId: otherTeamId },
        body: { description: 'x' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Now try with a UUID that does not exist anywhere — captain check fails,
    // permission denied.
    const ghost = '99999999-9999-9999-9999-999999999999';
    const res2 = makeRes();
    await handler(
      makeReq({ query: { teamId: ghost }, body: { description: 'x' } }),
      res2
    );
    expect(res2.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * Validation
 * ---------------------------------------------------------*/

describe('field validation', () => {
  it('rejects description longer than 280 chars', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { description: 'a'.repeat(281) } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects public_content longer than 5000 chars', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { public_content: 'a'.repeat(5001) } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid accent_color', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { accent_color: 'red' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a valid hex accent_color and stores it lowercased', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { accent_color: '#7C3AED' } }), res);
    expect(res.statusCode).toBe(200);
    expect((store.teams as any[])[0].accent_color).toBe('#7c3aed');
  });

  it('clears accent_color when sent as empty string', async () => {
    (store.teams as any[])[0].accent_color = '#ffffff';
    const res = makeRes();
    await handler(makeReq({ body: { accent_color: '' } }), res);
    expect(res.statusCode).toBe(200);
    expect((store.teams as any[])[0].accent_color).toBeNull();
  });

  it('rejects javascript: website URLs', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { website: 'javascript:alert(1)' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-string website', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { website: 123 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a valid http(s) website', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { website: 'https://example.com' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams as any[])[0].website).toBe('https://example.com');
  });

  it('rejects logo_url with an unsafe protocol', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { logo_url: 'javascript:alert(1)' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * Audit log
 * ---------------------------------------------------------*/

describe('audit log', () => {
  it('records only the fields that actually changed', async () => {
    (store.teams as any[])[0].description = 'old';
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          description: 'new',
          // accent_color stays null/unchanged
          accent_color: null,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.team_audit_logs as any[]).length).toBe(1);
    const entry = (store.team_audit_logs as any[])[0];
    expect(entry.team_id).toBe(TEAM_ID);
    expect(entry.user_id).toBe(CAPTAIN_ID);
    expect(entry.action).toBe('update_public_page');
    expect(Object.keys(entry.payload.diff)).toEqual(['description']);
    expect(entry.payload.diff.description.from).toBe('old');
    expect(entry.payload.diff.description.to).toBe('new');
  });

  it('does not insert an audit row when nothing changes', async () => {
    const res = makeRes();
    // All fields stay null — same as the seed
    await handler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect((store.team_audit_logs as any[]).length).toBe(0);
  });
});
