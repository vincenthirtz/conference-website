// tests/unit/cronSingleFlight.test.ts
//
// Verrou « un passage à la fois » des crons (utils/cronSingleFlight.ts).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextApiResponse } from 'next';

import {
  CRON_IN_FLIGHT_BODY,
  runCronSingleFlight,
  tryEnterCron,
  __resetCronSingleFlightForTests,
} from '@/utils/cronSingleFlight';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('cronSingleFlight', () => {
  beforeEach(() => {
    __resetCronSingleFlightForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuse un second passage tant que le premier tourne, puis le laisse passer', () => {
    const release = tryEnterCron('a');
    expect(release).toBeTypeOf('function');
    expect(tryEnterCron('a')).toBeNull();
    // Un autre cron n'est pas concerné.
    const other = tryEnterCron('b');
    expect(other).toBeTypeOf('function');
    release?.();
    expect(tryEnterCron('a')).toBeTypeOf('function');
  });

  it('reprend un verrou périmé, sans que l’ancien passage libère le nouveau', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    const stale = tryEnterCron('a', 1000);
    vi.setSystemTime(new Date('2026-10-12T10:00:02Z'));
    const fresh = tryEnterCron('a', 1000);
    expect(fresh).toBeTypeOf('function');
    // L'ancien passage finit enfin : le nouveau garde son verrou.
    stale?.();
    expect(tryEnterCron('a', 1000)).toBeNull();
    fresh?.();
    expect(tryEnterCron('a', 1000)).toBeTypeOf('function');
  });

  it('runCronSingleFlight répond 200 in_flight sans exécuter quand un passage tourne', async () => {
    let unblock: () => void = () => {};
    const first = runCronSingleFlight(
      'c',
      makeRes() as unknown as NextApiResponse,
      () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
        })
    );

    const run = vi.fn(async () => {});
    const res = makeRes();
    await runCronSingleFlight('c', res as unknown as NextApiResponse, run);
    expect(run).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(CRON_IN_FLIGHT_BODY);

    unblock();
    await first;
    await runCronSingleFlight(
      'c',
      makeRes() as unknown as NextApiResponse,
      run
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('libère le verrou même si le passage lève', async () => {
    await expect(
      runCronSingleFlight('d', makeRes() as unknown as NextApiResponse, () =>
        Promise.reject(new Error('boom'))
      )
    ).rejects.toThrow('boom');
    expect(tryEnterCron('d')).toBeTypeOf('function');
  });
});
