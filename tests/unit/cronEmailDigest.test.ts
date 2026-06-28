// tests/unit/cronEmailDigest.test.ts
//
// Tests pour pages/api/cron/email-digest.ts.
//   - 401 sans secret (header ou query).
//   - 200 + stats avec Bearer header.
//   - 200 + stats avec ?secret=.
//   - 405 sur mauvaise méthode.
//
// runEmailDispatcher est mocké pour isoler la couche auth/invocation du
// dispatcher réel. supabase est auto-mocké par testSetup.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { runEmailDispatcher } = vi.hoisted(() => ({
  runEmailDispatcher: vi.fn(async () => ({
    candidates: 3,
    emailsSent: 2,
    recipients: 2,
    skipped: 1,
  })),
}));

vi.mock('@/utils/emailDispatcher', () => ({ runEmailDispatcher }));

import { resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '@/pages/api/cron/email-digest';

const SECRET = 'cron-secret-xyz';

function makeReq(over: Partial<any> = {}): any {
  return { method: 'POST', headers: {}, query: {}, body: {}, ...over };
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

describe('POST /api/cron/email-digest', () => {
  const prev = process.env.CRON_SECRET;

  beforeEach(() => {
    resetSupabaseMock();
    runEmailDispatcher.mockClear();
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it('401s without any secret', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(401);
    expect(runEmailDispatcher).not.toHaveBeenCalled();
  });

  it('401s with a wrong bearer secret', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { authorization: 'Bearer nope' } }), res);
    expect(res.statusCode).toBe(401);
    expect(runEmailDispatcher).not.toHaveBeenCalled();
  });

  it('runs and returns stats with a valid bearer header', async () => {
    const res = makeRes();
    await handler(
      makeReq({ headers: { authorization: `Bearer ${SECRET}` } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(runEmailDispatcher).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({
      success: true,
      candidates: 3,
      emailsSent: 2,
      recipients: 2,
      skipped: 1,
    });
  });

  it('runs with a valid ?secret= query string', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { secret: SECRET } }), res);
    expect(res.statusCode).toBe(200);
    expect(runEmailDispatcher).toHaveBeenCalledTimes(1);
  });

  it('405s on an unsupported method', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'DELETE',
        headers: { authorization: `Bearer ${SECRET}` },
      }),
      res
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET,POST');
  });
});
