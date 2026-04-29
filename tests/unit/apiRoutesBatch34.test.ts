import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

const { sendTeamJoinEmail, sendWelcomeEmail } = vi.hoisted(() => ({
  sendTeamJoinEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
}));
vi.mock('@/utils/email', () => ({ sendTeamJoinEmail, sendWelcomeEmail }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  setCreateUserResult,
} from './__helpers__/supabaseMock';

import createWithMemberHandler from '../../pages/api/teams/create-with-member';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h' },
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

beforeEach(() => {
  resetSupabaseMock();
  sendTeamJoinEmail.mockClear();
  sendWelcomeEmail.mockClear();
});

/* -----------------------------------------------------------
 * /api/teams/create-with-member
 * ---------------------------------------------------------*/

describe('POST /api/teams/create-with-member', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await createWithMemberHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when name too short', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({ body: { name: 'A' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when name too long', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({ body: { name: 'a'.repeat(101) } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when description too long', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          description: 'd'.repeat(2001),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when logo_url is invalid', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          logo_url: 'javascript:alert(1)',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when more than 5 members provided', async () => {
    const members = Array.from({ length: 6 }, (_, i) => ({
      email: `p${i}@example.com`,
      battle_tag: `Player${i}#1234`,
    }));
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Alpha', members },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 creates team alone (no members)', async () => {
    store.teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Alpha Team' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).team.name).toBe('Alpha Team');
    expect((store.teams as any).length).toBe(1);
  });

  it('201 creates team with normalized fields from a slugifiable name', async () => {
    store.teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Hello World Team!', country: 'FR' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.teams as any)[0];
    expect(inserted.name).toBe('Hello World Team!');
    expect(inserted.country).toBe('FR');
  });

  it('200 with member_email auto-creates user and adds member as captain', async () => {
    store.teams = [];
    store.team_members = [];
    setAuthListUsers([]); // user does not exist yet
    setCreateUserResult({
      data: { user: { id: 'u-new', email: 'cap@example.com' } },
      error: null,
    });
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'My Team',
          member_email: 'cap@example.com',
          member_battle_tag: 'Captain#1234',
          set_captain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.teams as any)[0].captain_id).toBe('u-new');
    expect(store.team_members.length).toBe(1);
  });

  it('200 with multiple members (cleanedMembers path)', async () => {
    store.teams = [];
    store.team_members = [];
    setAuthListUsers([]);
    setCreateUserResult({
      data: { user: { id: 'u-1', email: 'p1@example.com' } },
      error: null,
    });
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'My Team',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              battle_tag: 'Player1#1234',
              set_captain: true,
            },
            {
              email: 'p2@example.com',
              role: 'player',
              battle_tag: 'Player2#5678',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.teams as any).length).toBe(1);
  });
});
