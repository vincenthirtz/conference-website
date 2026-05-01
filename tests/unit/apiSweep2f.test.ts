// Sweep 2f: cast-members/[id] CRUD + helloasso/sync.
//
// Targets:
//  - pages/api/admin/cast-members/[id].ts (~110 lines)
//  - pages/api/admin/helloasso/sync.ts (~200 lines)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { fetchForms, fetchMemberships } = vi.hoisted(() => ({
  fetchForms: vi.fn(
    async () =>
      [] as Array<{
        formSlug: string;
        formType: string;
        title: string;
        state: string;
      }>
  ),
  fetchMemberships: vi.fn(async () => ({
    data: [] as any[],
    pagination: { pageIndex: 1, pageSize: 100, totalCount: 0, totalPages: 0 },
  })),
}));
vi.mock('@/utils/helloasso', () => ({ fetchForms, fetchMemberships }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import castMemberIdHandler from '../../pages/api/admin/cast-members/[id]';
import syncHandler from '../../pages/api/admin/helloasso/sync';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
): StaffMember {
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

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  fetchForms.mockClear();
  fetchMemberships.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/cast-members/[id]
 * ---------------------------------------------------------*/

describe('/api/admin/cast-members/[id]', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await castMemberIdHandler(
      makeAuthedReq({ method: 'GET', query: { id: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when not found', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await castMemberIdHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(404);
  });

  it('GET returns the cast member', async () => {
    store.cast_members = [
      {
        id: VALID_UUID,
        name: 'Caster One',
        title: 'Lead caster',
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await castMemberIdHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).name).toBe('Caster One');
  });

  it('PATCH updates fields (with stubbed update chain)', async () => {
    store.cast_members = [
      { id: VALID_UUID, name: 'Old', title: null, is_active: true },
    ] as any;
    // The shared mock's update().select().single() returns null for unmatched rows
    // even though the row exists — override locally.
    const originalFrom = supabaseAdmin.from;
    const updatedRow = {
      id: VALID_UUID,
      name: 'New Name',
      title: 'Lead',
      is_active: false,
      sort_order: 5,
    };
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'cast_members') {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: updatedRow, error: null }),
              }),
            }),
          }),
        };
      }
      return originalFrom(table);
    };

    try {
      const res = makeRes();
      await castMemberIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID },
          body: {
            name: '  New Name  ',
            title: 'Lead',
            description: '',
            imageUrl: 'https://x.test/image.png',
            twitchUrl: 'https://twitch.tv/me',
            city: '  Paris  ',
            isActive: false,
            isPromo: true,
            sortOrder: 5,
          },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect((res.body as any).name).toBe('New Name');
    } finally {
      (supabaseAdmin as any).from = originalFrom;
    }
  });

  it('PATCH returns 500 on db error', async () => {
    const originalFrom = supabaseAdmin.from;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'cast_members') {
        return {
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'boom' },
                }),
              }),
            }),
          }),
        };
      }
      return originalFrom(table);
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = makeRes();
      await castMemberIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID },
          body: { name: 'X' },
        }),
        res
      );
      expect(res.statusCode).toBe(500);
    } finally {
      consoleSpy.mockRestore();
      (supabaseAdmin as any).from = originalFrom;
    }
  });

  it('DELETE removes the cast member', async () => {
    store.cast_members = [{ id: VALID_UUID, name: 'X' }] as any;
    const res = makeRes();
    await castMemberIdHandler(
      makeAuthedReq({ method: 'DELETE', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(204);
    expect((store.cast_members as any[]).length).toBe(0);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await castMemberIdHandler(
      makeAuthedReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  // Sanitisation coverage: trims whitespace, drops javascript: image URLs,
  // accepts twitch_url, sort_order, city. Hits the in-memory store path
  // (no stubbed update chain), which the previous test cannot exercise.
  it('PATCH sanitises and writes allowed fields to the store', async () => {
    store.cast_members = [
      { id: VALID_UUID, name: 'old', is_active: false, sort_order: 1 },
    ] as any;
    const res = makeRes();
    await castMemberIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: VALID_UUID },
        body: {
          name: '  New  ',
          isActive: true,
          twitchUrl: 'https://twitch.tv/x',
          imageUrl: 'javascript:alert(1)',
          sortOrder: 9,
          city: '  Paris  ',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const m = (store.cast_members as any)[0];
    expect(m.name).toBe('New');
    expect(m.is_active).toBe(true);
    expect(m.twitch_url).toBe('https://twitch.tv/x');
    expect(m.image_url).toBeNull();
    expect(m.sort_order).toBe(9);
    expect(m.city).toBe('Paris');
  });
});

/* -----------------------------------------------------------
 * /api/admin/helloasso/sync
 * ---------------------------------------------------------*/

describe('/api/admin/helloasso/sync', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await syncHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('404 when no Membership form found via auto-detect', async () => {
    fetchForms.mockResolvedValueOnce([
      { formSlug: 'don', formType: 'Donation', title: 'Don', state: 'Public' },
    ]);
    const res = makeRes();
    await syncHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('502 when fetchForms throws', async () => {
    fetchForms.mockRejectedValueOnce(new Error('upstream'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await syncHandler(makeAuthedReq({ method: 'POST' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(502);
  });

  it('200 with empty memberships when explicit formSlug given', async () => {
    const res = makeRes();
    await syncHandler(
      makeAuthedReq({ method: 'POST', query: { formSlug: 'my-form' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).total).toBe(0);
    expect(fetchMemberships).toHaveBeenCalledWith('my-form', 1, 100);
  });

  it('200 syncs creates + updates + skips correctly', async () => {
    fetchMemberships.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          payer: { firstName: 'Alice', lastName: 'A', email: 'a@x.com' },
          user: { firstName: 'Alice', lastName: 'A' },
          amount: 1000,
          order: { date: '2026-04-01T00:00:00Z' },
        },
        {
          id: 2,
          payer: { firstName: 'Bob', lastName: 'B', email: 'b@x.com' },
          user: { firstName: 'Bob', lastName: 'B' },
          amount: 2000,
          order: { date: '2026-04-02T00:00:00Z' },
        },
        {
          id: 3,
          payer: { firstName: 'Carol', lastName: 'C', email: 'c@x.com' },
          user: { firstName: 'Carol', lastName: 'C' },
          amount: 1500,
          order: { date: '2026-04-03T00:00:00Z' },
        },
        // No email — should be skipped silently
        {
          id: 4,
          payer: { firstName: 'X', lastName: 'X', email: null },
          user: { firstName: 'X', lastName: 'X' },
          amount: 0,
          order: { date: '2026-04-04T00:00:00Z' },
        },
      ],
      pagination: {
        pageIndex: 1,
        pageSize: 100,
        totalCount: 3,
        totalPages: 1,
      },
    });
    // Pre-existing adherents:
    //   - a@x.com same payment_reference → skipped
    //   - b@x.com new helloasso ID → updated
    //   - c@x.com no row → created
    store.adherents = [
      {
        id: 'adh-a',
        email: 'a@x.com',
        payment_reference: 'helloasso:1',
      },
      {
        id: 'adh-b',
        email: 'b@x.com',
        payment_reference: 'helloasso:0', // stale → will be updated
      },
    ] as any;

    const res = makeRes();
    await syncHandler(
      makeAuthedReq({ method: 'POST', query: { formSlug: 'my-form' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.total).toBe(3);
    expect(body.created).toBe(1);
    expect(body.updated).toBe(1);
    expect(body.skipped).toBe(1);
    expect((store.staff_logs as any[]).length).toBe(1);
  });

  it('iterates pages when totalPages > 1', async () => {
    fetchMemberships
      .mockResolvedValueOnce({
        data: [
          {
            id: 10,
            payer: { firstName: 'Dan', lastName: 'D', email: 'd@x.com' },
            amount: 1000,
            order: { date: '2026-04-10T00:00:00Z' },
          },
        ],
        pagination: {
          pageIndex: 1,
          pageSize: 100,
          totalCount: 2,
          totalPages: 2,
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 11,
            payer: { firstName: 'Eve', lastName: 'E', email: 'e@x.com' },
            amount: 1000,
            order: { date: '2026-04-11T00:00:00Z' },
          },
        ],
        pagination: {
          pageIndex: 2,
          pageSize: 100,
          totalCount: 2,
          totalPages: 2,
        },
      });
    const res = makeRes();
    await syncHandler(
      makeAuthedReq({ method: 'POST', query: { formSlug: 'my-form' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).total).toBe(2);
    expect(fetchMemberships).toHaveBeenCalledTimes(2);
  });
});
