// tests/unit/apiAdminLogout.test.ts
//
// POST /api/admin/logout : protection CSRF (même csrfCheck Origin/Referer que
// withStaffRoute) + comportement nominal conservé pour les requêtes légitimes.

import { describe, it, expect, beforeEach } from 'vitest';

import { resetSupabaseMock, setCookieUser } from './__helpers__/supabaseMock';

import logoutHandler from '../../pages/api/admin/logout';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'owwomenscup.fr' },
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
  setCookieUser({ id: 'user-1' });
});

describe('POST /api/admin/logout', () => {
  it('405 sur GET', async () => {
    const res = makeRes();
    await logoutHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('403 sans Origin ni Referer (requête cross-site potentielle)', async () => {
    const res = makeRes();
    await logoutHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('403 quand l’Origin ne matche pas le host', async () => {
    const res = makeRes();
    await logoutHandler(
      makeReq({
        headers: { host: 'owwomenscup.fr', origin: 'https://evil.test' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('403 quand le Referer ne matche pas le host', async () => {
    const res = makeRes();
    await logoutHandler(
      makeReq({
        headers: {
          host: 'owwomenscup.fr',
          referer: 'https://evil.test/admin',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('200 quand l’Origin matche le host (requête légitime)', async () => {
    const res = makeRes();
    await logoutHandler(
      makeReq({
        headers: { host: 'owwomenscup.fr', origin: 'https://owwomenscup.fr' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
  });

  it('200 quand le Referer matche le host', async () => {
    const res = makeRes();
    await logoutHandler(
      makeReq({
        headers: {
          host: 'owwomenscup.fr',
          referer: 'https://owwomenscup.fr/admin/settings',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
  });

  it('200 avec un Bearer token (non-navigateur, CSRF non applicable)', async () => {
    const res = makeRes();
    await logoutHandler(
      makeReq({
        headers: { host: 'owwomenscup.fr', authorization: 'Bearer t-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
  });
});
