// Unit tests for the cast_members ↔ staff caster linking feature.
//
// Targets:
//  - pages/api/admin/cast-members/index.ts            (POST authUserId support)
//  - pages/api/admin/cast-members/[id].ts             (PATCH authUserId support)
//  - pages/api/admin/cast-members/available-casters.ts (new endpoint)
//  - pages/api/cast/[matchId].ts                      (castProfile enrichment)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import castMembersHandler from '../../pages/api/admin/cast-members/index';
import castMemberByIdHandler from '../../pages/api/admin/cast-members/[id]';
import availableCastersHandler from '../../pages/api/admin/cast-members/available-casters';
import castMatchHandler from '../../pages/api/cast/[matchId]';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin',
  over: Partial<StaffMember> = {}
): StaffMember {
  return {
    id: 'staff-admin',
    auth_user_id: 'user-admin',
    email: 'admin@example.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const VALID_UUID_1 = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';
const CASTER_USER_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  // Default: admin user signed in.
  setAuthUser({ id: 'user-admin' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/cast-members/available-casters (GET)
 * ---------------------------------------------------------*/

describe('/api/admin/cast-members/available-casters', () => {
  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await availableCastersHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('returns only staff with role=caster, with their existing link', async () => {
    store.staff = [
      makeStaffRow('admin'),
      makeStaffRow('caster', {
        id: 'staff-caster-1',
        auth_user_id: CASTER_USER_ID,
        email: 'caster1@example.com',
        display_name: 'Caster One',
      }),
      makeStaffRow('caster', {
        id: 'staff-caster-2',
        auth_user_id: OTHER_USER_ID,
        email: 'caster2@example.com',
        display_name: null,
      }),
      makeStaffRow('admin', {
        id: 'staff-mgr',
        auth_user_id: 'user-mgr',
        email: 'mgr@example.com',
      }),
    ] as any;

    store.cast_members = [
      {
        id: VALID_UUID_1,
        name: 'Caster One Public',
        is_active: true,
        auth_user_id: CASTER_USER_ID,
      },
    ] as any;

    const res = makeRes();
    await availableCastersHandler(makeAuthedReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items as Array<{
      authUserId: string;
      email: string;
      linkedCastMemberId: string | null;
    }>;
    // Only casters, not admin/manager.
    expect(items.map((i) => i.email).sort()).toEqual([
      'caster1@example.com',
      'caster2@example.com',
    ]);

    const linked = items.find((i) => i.authUserId === CASTER_USER_ID);
    expect(linked?.linkedCastMemberId).toBe(VALID_UUID_1);

    const unlinked = items.find((i) => i.authUserId === OTHER_USER_ID);
    expect(unlinked?.linkedCastMemberId).toBeNull();
  });

  it('returns 403 when caller has only caster role', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    const res = makeRes();
    await availableCastersHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * POST /api/admin/cast-members — authUserId payload
 * ---------------------------------------------------------*/

describe('POST /api/admin/cast-members (authUserId)', () => {
  it('stores auth_user_id when a valid UUID is provided', async () => {
    const res = makeRes();
    await castMembersHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          name: 'Linked Caster',
          authUserId: CASTER_USER_ID,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const inserted = (store.cast_members as any).find(
      (c: any) => c.name === 'Linked Caster'
    );
    expect(inserted.auth_user_id).toBe(CASTER_USER_ID);
  });

  it('rejects an invalid authUserId with 400', async () => {
    const res = makeRes();
    await castMembersHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          name: 'Bad Link',
          authUserId: 'not-a-uuid',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/authUserId/i);
  });

  it('stores null when authUserId is omitted', async () => {
    const res = makeRes();
    await castMembersHandler(
      makeAuthedReq({
        method: 'POST',
        body: { name: 'No Link' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.cast_members as any).find(
      (c: any) => c.name === 'No Link'
    );
    expect(inserted.auth_user_id).toBeNull();
  });
});

/* -----------------------------------------------------------
 * PATCH /api/admin/cast-members/[id] — authUserId payload
 * ---------------------------------------------------------*/

describe('PATCH /api/admin/cast-members/[id] (authUserId)', () => {
  function stubUpdateReturning(updatedRow: Record<string, unknown>) {
    const originalFrom = supabaseAdmin.from;
    let captured: Record<string, unknown> | null = null;
    // Handler chains .update().eq('id', …).eq('tenant_id', …).select().single().
    // The stub returns a self-referential object where .eq() returns itself so
    // any number of .eq() calls keep chaining cleanly.
    const chain: any = {
      eq: () => chain,
      select: () => chain,
      single: async () => ({
        data: { ...updatedRow, ...captured },
        error: null,
      }),
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'cast_members') {
        return {
          update: (payload: Record<string, unknown>) => {
            captured = payload;
            return chain;
          },
        };
      }
      return originalFrom(table);
    };
    return {
      restore: () => {
        (supabaseAdmin as any).from = originalFrom;
      },
      getCaptured: () => captured,
    };
  }

  it('forwards a valid authUserId to the update payload', async () => {
    const stub = stubUpdateReturning({ id: VALID_UUID_1, name: 'X' });
    try {
      const res = makeRes();
      await castMemberByIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID_1 },
          body: { authUserId: CASTER_USER_ID },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      const captured = stub.getCaptured() as any;
      expect(captured.auth_user_id).toBe(CASTER_USER_ID);
    } finally {
      stub.restore();
    }
  });

  it('clears the link when authUserId is null', async () => {
    const stub = stubUpdateReturning({ id: VALID_UUID_1, name: 'X' });
    try {
      const res = makeRes();
      await castMemberByIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID_1 },
          body: { authUserId: null },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      const captured = stub.getCaptured() as any;
      expect(captured.auth_user_id).toBeNull();
    } finally {
      stub.restore();
    }
  });

  it('clears the link when authUserId is empty string', async () => {
    const stub = stubUpdateReturning({ id: VALID_UUID_1, name: 'X' });
    try {
      const res = makeRes();
      await castMemberByIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID_1 },
          body: { authUserId: '' },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      const captured = stub.getCaptured() as any;
      expect(captured.auth_user_id).toBeNull();
    } finally {
      stub.restore();
    }
  });

  it('returns 400 on an invalid authUserId', async () => {
    const res = makeRes();
    await castMemberByIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: VALID_UUID_1 },
        body: { authUserId: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('translates trigger error into a 400 with friendly message', async () => {
    const originalFrom = supabaseAdmin.from;
    // Chainable .eq()/.select() so the handler's
    // .update().eq('id').eq('tenant_id').select().single() resolves to a
    // trigger error.
    const errChain: any = {
      eq: () => errChain,
      select: () => errChain,
      single: async () => ({
        data: null,
        error: {
          code: 'XX000',
          message:
            'cast_members.auth_user_id (xx) doit referencer un staff avec role=caster',
        },
      }),
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'cast_members') {
        return {
          update: () => errChain,
        };
      }
      return originalFrom(table);
    };
    try {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const res = makeRes();
      await castMemberByIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID_1 },
          body: { authUserId: CASTER_USER_ID },
        }),
        res
      );
      consoleSpy.mockRestore();
      expect(res.statusCode).toBe(400);
      expect((res.body as any).error).toMatch(/role staff "caster"/i);
    } finally {
      (supabaseAdmin as any).from = originalFrom;
    }
  });

  it('translates unique-violation error into a 409', async () => {
    const originalFrom = supabaseAdmin.from;
    // Chainable to support .eq('id').eq('tenant_id').select().single().
    const errChain: any = {
      eq: () => errChain,
      select: () => errChain,
      single: async () => ({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      }),
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'cast_members') {
        return {
          update: () => errChain,
        };
      }
      return originalFrom(table);
    };
    try {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const res = makeRes();
      await castMemberByIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID_1 },
          body: { authUserId: CASTER_USER_ID },
        }),
        res
      );
      consoleSpy.mockRestore();
      expect(res.statusCode).toBe(409);
      expect((res.body as any).error).toMatch(/deja lie/i);
    } finally {
      (supabaseAdmin as any).from = originalFrom;
    }
  });
});

/* -----------------------------------------------------------
 * GET /api/cast/[matchId] — castProfile enrichment
 * ---------------------------------------------------------*/

describe('GET /api/cast/[matchId] (castProfile)', () => {
  beforeEach(() => {
    // Sign in as a caster user.
    setAuthUser({ id: CASTER_USER_ID });
    store.staff = [
      makeStaffRow('caster', {
        id: 'staff-caster',
        auth_user_id: CASTER_USER_ID,
        email: 'caster@example.com',
      }),
    ] as any;
    store.matches = [
      {
        id: VALID_UUID_2,
        status: 'ongoing',
        match_format: 'bo3',
        team1_id: null,
        team2_id: null,
      },
    ] as any;
  });

  it('returns castProfile when the connected user is linked to an active fiche', async () => {
    store.cast_members = [
      {
        id: VALID_UUID_1,
        name: 'Caster Display',
        title: 'Lead caster',
        image_url: '/img/x.png',
        twitch_url: 'https://twitch.tv/x',
        is_active: true,
        auth_user_id: CASTER_USER_ID,
      },
    ] as any;

    const res = makeRes();
    await castMatchHandler(
      makeAuthedReq({
        method: 'GET',
        query: { matchId: VALID_UUID_2 },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const profile = (res.body as any).castProfile;
    expect(profile).toMatchObject({
      id: VALID_UUID_1,
      name: 'Caster Display',
      title: 'Lead caster',
      imageUrl: '/img/x.png',
      twitchUrl: 'https://twitch.tv/x',
    });
  });

  it('returns castProfile=null when the user has no linked fiche', async () => {
    store.cast_members = [] as any;

    const res = makeRes();
    await castMatchHandler(
      makeAuthedReq({
        method: 'GET',
        query: { matchId: VALID_UUID_2 },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).castProfile).toBeNull();
  });

  it('skips inactive fiches', async () => {
    store.cast_members = [
      {
        id: VALID_UUID_1,
        name: 'Caster Display',
        is_active: false,
        auth_user_id: CASTER_USER_ID,
      },
    ] as any;

    const res = makeRes();
    await castMatchHandler(
      makeAuthedReq({
        method: 'GET',
        query: { matchId: VALID_UUID_2 },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).castProfile).toBeNull();
  });
});
