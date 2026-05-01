import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  fromCalls,
  resetSupabaseMock,
  setAuthUser,
  setCookieUser,
} from './__helpers__/supabaseMock';

import {
  getStaffByUserId,
  getStaffRole,
  invalidateStaffCache,
  getStaffContextFromRequest,
  requireStaffRoleFromRequest,
  withStaffRoute,
  withStaffPage,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '../../utils/staff';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'admin@example.com',
    role: 'admin',
    display_name: 'Admin',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function seedStaff(rows: StaffMember[]) {
  store.staff = rows as any;
}

function makeReq(overrides: Partial<Record<string, any>> = {}) {
  return {
    method: 'GET',
    headers: {
      host: 'example.com',
    },
    ...overrides,
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn((_code: number) => res);
  res.json = vi.fn((_body: unknown) => res);
  res.setHeader = vi.fn();
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

/* -----------------------------------------------------------
 * getStaffByUserId — happy path + cache
 * ---------------------------------------------------------*/

describe('getStaffByUserId', () => {
  it('returns the matching staff row', async () => {
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'admin' })]);
    const staff = await getStaffByUserId('user-1');
    expect(staff?.id).toBe('staff-1');
    expect(staff?.role).toBe('admin');
  });

  it('returns null when no staff matches', async () => {
    seedStaff([]);
    expect(await getStaffByUserId('user-x')).toBeNull();
  });

  it('caches results so a second call does not re-query', async () => {
    seedStaff([makeStaff({ auth_user_id: 'user-1' })]);

    await getStaffByUserId('user-1');
    const before = fromCalls.length;
    await getStaffByUserId('user-1'); // cached
    expect(fromCalls.length).toBe(before);
  });

  it('invalidateStaffCache(user) drops only that user', async () => {
    seedStaff([makeStaff({ auth_user_id: 'user-1' })]);
    await getStaffByUserId('user-1');

    invalidateStaffCache('user-1');
    const before = fromCalls.length;
    await getStaffByUserId('user-1');
    expect(fromCalls.length).toBe(before + 1);
  });

  it('invalidateStaffCache() with no arg clears every entry', async () => {
    seedStaff([
      makeStaff({ auth_user_id: 'user-1' }),
      makeStaff({ id: 'staff-2', auth_user_id: 'user-2' }),
    ]);
    await getStaffByUserId('user-1');
    await getStaffByUserId('user-2');

    invalidateStaffCache();
    const before = fromCalls.length;
    await getStaffByUserId('user-1');
    await getStaffByUserId('user-2');
    expect(fromCalls.length).toBe(before + 2);
  });
});

describe('getStaffRole', () => {
  it('returns the role when staff exists', async () => {
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'manager' })]);
    expect(await getStaffRole('user-1')).toBe('manager');
  });

  it('returns null when no staff exists', async () => {
    expect(await getStaffRole('nope')).toBeNull();
  });
});

/* -----------------------------------------------------------
 * getStaffContextFromRequest
 * ---------------------------------------------------------*/

describe('getStaffContextFromRequest', () => {
  it('returns empty context when there is no auth token nor cookie session', async () => {
    setCookieUser(null, { message: 'Auth session missing', status: 400 });
    const ctx = await getStaffContextFromRequest(makeReq(), makeRes());
    expect(ctx).toEqual({ user: null, staff: null, role: null });
  });

  it('resolves user from a Bearer token', async () => {
    setAuthUser({ id: 'user-1', email: 'a@a.com' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'owner' })]);

    const ctx = await getStaffContextFromRequest(
      makeReq({ headers: { host: 'h', authorization: 'Bearer abc' } }),
      makeRes()
    );
    expect(ctx.user?.id).toBe('user-1');
    expect(ctx.role).toBe('owner');
  });

  it('falls back to the cookie session when no Bearer token', async () => {
    setCookieUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'caster' })]);

    const ctx = await getStaffContextFromRequest(makeReq(), makeRes());
    expect(ctx.user?.id).toBe('user-1');
    expect(ctx.role).toBe('caster');
  });

  it('memoizes the context on the request object', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1' })]);

    const req = makeReq({ headers: { host: 'h', authorization: 'Bearer t' } });
    await getStaffContextFromRequest(req, makeRes());
    const callsAfterFirst = fromCalls.length;
    await getStaffContextFromRequest(req, makeRes());
    // Second call should not have hit Supabase again.
    expect(fromCalls.length).toBe(callsAfterFirst);
  });
});

/* -----------------------------------------------------------
 * requireStaffRoleFromRequest
 * ---------------------------------------------------------*/

describe('requireStaffRoleFromRequest', () => {
  it('throws StaffUnauthenticatedError when no user', async () => {
    setCookieUser(null);
    await expect(
      requireStaffRoleFromRequest(makeReq(), makeRes(), 'caster')
    ).rejects.toBeInstanceOf(StaffUnauthenticatedError);
  });

  it('throws StaffUnauthorizedError when role is missing', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([]); // user exists but is not staff

    await expect(
      requireStaffRoleFromRequest(
        makeReq({ headers: { host: 'h', authorization: 'Bearer t' } }),
        makeRes(),
        'caster'
      )
    ).rejects.toBeInstanceOf(StaffUnauthorizedError);
  });

  it('throws StaffUnauthorizedError when role rank is too low', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'caster' })]);

    await expect(
      requireStaffRoleFromRequest(
        makeReq({ headers: { host: 'h', authorization: 'Bearer t' } }),
        makeRes(),
        'admin'
      )
    ).rejects.toBeInstanceOf(StaffUnauthorizedError);
  });

  it('returns the staff context when authorized', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'owner' })]);

    const ctx = await requireStaffRoleFromRequest(
      makeReq({ headers: { host: 'h', authorization: 'Bearer t' } }),
      makeRes(),
      'admin'
    );
    expect(ctx.role).toBe('owner');
  });
});

/* -----------------------------------------------------------
 * withStaffRoute (CSRF + auth wrapper)
 * ---------------------------------------------------------*/

describe('withStaffRoute', () => {
  it('rejects state-changing requests without origin/referer matching host', async () => {
    const handler = vi.fn();
    const route = withStaffRoute(handler, 'admin');

    const req = makeReq({ method: 'POST' }); // no origin / referer
    const res = makeRes();
    await route(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts a POST with a Bearer token (CSRF bypass)', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'owner' })]);

    const handler = vi.fn(async () => {});
    const route = withStaffRoute(handler, 'admin');

    const req = makeReq({
      method: 'POST',
      headers: { host: 'h', authorization: 'Bearer t' },
    });
    const res = makeRes();
    await route(req, res);

    expect(handler).toHaveBeenCalledOnce();
  });

  it('accepts a POST when Origin matches Host', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'owner' })]);

    const handler = vi.fn(async () => {});
    const route = withStaffRoute(handler, 'admin');

    const req = makeReq({
      method: 'POST',
      headers: {
        host: 'example.com',
        origin: 'https://example.com',
        authorization: 'Bearer t',
      },
    });
    const res = makeRes();
    await route(req, res);

    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns 401 when request is unauthenticated', async () => {
    setCookieUser(null);
    const handler = vi.fn();
    const route = withStaffRoute(handler, 'admin');
    const req = makeReq();
    const res = makeRes();
    await route(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when role is insufficient', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'caster' })]);

    const handler = vi.fn();
    const route = withStaffRoute(handler, 'admin');
    const req = makeReq({
      headers: { host: 'h', authorization: 'Bearer t' },
    });
    const res = makeRes();
    await route(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 500 on an unexpected error inside the handler', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'owner' })]);

    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const route = withStaffRoute(handler, 'admin');
    const req = makeReq({
      headers: { host: 'h', authorization: 'Bearer t' },
    });
    const res = makeRes();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await route(req, res);
    consoleSpy.mockRestore();

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('uses minRole=admin by default', async () => {
    // caster cannot access — default minRole is admin
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'caster' })]);

    const handler = vi.fn();
    const route = withStaffRoute(handler);
    const req = makeReq({
      headers: { host: 'h', authorization: 'Bearer t' },
    });
    const res = makeRes();
    await route(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * withStaffPage (SSR wrapper)
 * ---------------------------------------------------------*/

describe('withStaffPage', () => {
  it('redirects to /admin/login when unauthenticated', async () => {
    setCookieUser(null);
    const ssr = withStaffPage('admin');
    const ctx = { req: makeReq(), res: makeRes() } as any;
    const result = (await ssr(ctx)) as any;
    expect(result.redirect.destination).toBe('/admin/login');
  });

  it('redirects to /403 when role is insufficient', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'caster' })]);

    const ssr = withStaffPage('admin');
    const ctx = {
      req: makeReq({ headers: { host: 'h', authorization: 'Bearer t' } }),
      res: makeRes(),
    } as any;
    const result = (await ssr(ctx)) as any;
    expect(result.redirect.destination).toBe('/403');
  });

  it('returns props with staff info when authorized (no loader)', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([
      makeStaff({
        auth_user_id: 'user-1',
        role: 'owner',
        display_name: 'Boss',
      }),
    ]);

    const ssr = withStaffPage('admin');
    const ctx = {
      req: makeReq({ headers: { host: 'h', authorization: 'Bearer t' } }),
      res: makeRes(),
    } as any;
    const result = (await ssr(ctx)) as any;
    expect(result.props.staff.role).toBe('owner');
    expect(result.props.staff.display_name).toBe('Boss');
  });

  it('merges loader-provided props with staff baseProps', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'admin' })]);

    const ssr = withStaffPage<{ extra: number }>('admin', async () => ({
      extra: 42,
    }));
    const ctx = {
      req: makeReq({ headers: { host: 'h', authorization: 'Bearer t' } }),
      res: makeRes(),
    } as any;
    const result = (await ssr(ctx)) as any;
    expect(result.props.extra).toBe(42);
    expect(result.props.staff.role).toBe('admin');
  });

  it('redirects to /500 on an unexpected error inside the loader', async () => {
    setAuthUser({ id: 'user-1' });
    seedStaff([makeStaff({ auth_user_id: 'user-1', role: 'admin' })]);

    const ssr = withStaffPage('admin', async () => {
      throw new Error('loader boom');
    });
    const ctx = {
      req: makeReq({ headers: { host: 'h', authorization: 'Bearer t' } }),
      res: makeRes(),
    } as any;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = (await ssr(ctx)) as any;
    consoleSpy.mockRestore();
    expect(result.redirect.destination).toBe('/500');
  });
});
