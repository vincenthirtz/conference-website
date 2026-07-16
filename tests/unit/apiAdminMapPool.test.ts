// tests/unit/apiAdminMapPool.test.ts
//
// Couvre le CRUD du catalogue de maps tenant-level (`tenant_map_pool`) :
//  - GET   /api/admin/map-pool           (groupé par jeu) + ?game= (liste plate)
//  - POST  /api/admin/map-pool           (201 + 409 doublon + 400 game invalide)
//  - PATCH /api/admin/map-pool/[mapId]   (200 + scoping tenant 404)
//  - DELETE /api/admin/map-pool/[mapId]  (200 ok + scoping tenant 404)
//  - POST  /api/admin/map-pool/import-defaults (seed depuis config/games,
//    idempotent : skip des doublons)
//
// Auth : rôle manager. Mock Supabase in-memory (pas de vraie DB — la table est
// créée par une migration séparée). Le scoping tenant strict est vérifié via
// une row seedée sur un AUTRE tenant → 404.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { getGame } from '../../config/games';

import mapPoolIndexHandler from '../../pages/api/admin/map-pool/index';
import mapPoolItemHandler from '../../pages/api/admin/map-pool/[mapId]';
import importDefaultsHandler from '../../pages/api/admin/map-pool/import-defaults';

const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const MAP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_MAP_ID = '22222222-2222-4222-8222-222222222222';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
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

let _ipCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  _ipCounter += 1;
  return {
    method: 'GET',
    // IP unique par requête → chaque write a son propre bucket rate-limit.
    headers: {
      host: 'h',
      authorization: 'Bearer t-1',
      'x-forwarded-for': `198.51.100.${(_ipCounter % 250) + 1}`,
    },
    socket: { remoteAddress: '127.0.0.1' },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined,
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
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* -----------------------------------------------------------
 * GET
 * ---------------------------------------------------------*/

describe('GET /api/admin/map-pool', () => {
  it('grouped by game (no query), sorted by order_index NULLS LAST then name', async () => {
    store.tenant_map_pool = [
      { id: 'a', game: 'overwatch', map_name: 'Busan', order_index: 1 },
      { id: 'b', game: 'overwatch', map_name: 'Ilios', order_index: null },
      { id: 'c', game: 'overwatch', map_name: 'Nepal', order_index: 0 },
      { id: 'd', game: 'valorant', map_name: 'Ascent', order_index: 0 },
    ] as any;

    const res = makeRes();
    await mapPoolIndexHandler(makeReq({ method: 'GET', query: {} }), res);

    expect(res.statusCode).toBe(200);
    const pools = (res.body as any).pools;
    expect(pools.overwatch.map((m: any) => m.map_name)).toEqual([
      'Nepal', // order_index 0
      'Busan', // order_index 1
      'Ilios', // null → last
    ]);
    expect(pools.valorant.map((m: any) => m.map_name)).toEqual(['Ascent']);
    // Un jeu sans map est présent avec un tableau vide.
    expect(pools.cs2).toEqual([]);
  });

  it('?game=<slug> returns a flat list', async () => {
    store.tenant_map_pool = [
      { id: 'a', game: 'overwatch', map_name: 'Busan', order_index: 0 },
      { id: 'd', game: 'valorant', map_name: 'Ascent', order_index: 0 },
    ] as any;

    const res = makeRes();
    await mapPoolIndexHandler(
      makeReq({ method: 'GET', query: { game: 'overwatch' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).game).toBe('overwatch');
    expect((res.body as any).maps).toHaveLength(1);
    expect((res.body as any).maps[0].map_name).toBe('Busan');
  });

  it('?game=<invalid> → 400', async () => {
    const res = makeRes();
    await mapPoolIndexHandler(
      makeReq({ method: 'GET', query: { game: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GAME');
  });
});

/* -----------------------------------------------------------
 * POST create
 * ---------------------------------------------------------*/

describe('POST /api/admin/map-pool', () => {
  it('201 creates a map with auto order_index', async () => {
    store.tenant_map_pool = [
      { id: 'a', game: 'overwatch', map_name: 'Busan', order_index: 3 },
    ] as any;

    const res = makeRes();
    await mapPoolIndexHandler(
      makeReq({
        method: 'POST',
        body: { game: 'overwatch', map_name: 'Nepal', map_type: 'control' },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const inserted = (store.tenant_map_pool as any).find(
      (m: any) => m.map_name === 'Nepal'
    );
    expect(inserted).toBeTruthy();
    expect(inserted.order_index).toBe(4);
    expect(inserted.enabled).toBe(true);
    expect(logStaffActionMock).toHaveBeenCalled();
  });

  it('409 on duplicate (case-insensitive) for same tenant+game', async () => {
    store.tenant_map_pool = [
      { id: 'a', game: 'overwatch', map_name: 'Busan', order_index: 0 },
    ] as any;

    const res = makeRes();
    await mapPoolIndexHandler(
      makeReq({
        method: 'POST',
        body: { game: 'overwatch', map_name: 'busan' },
      }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('DUPLICATE_MAP');
    // Pas d'insertion.
    expect((store.tenant_map_pool as any).length).toBe(1);
  });

  it('same name on a DIFFERENT game is allowed (201)', async () => {
    store.tenant_map_pool = [
      { id: 'a', game: 'overwatch', map_name: 'Split', order_index: 0 },
    ] as any;

    const res = makeRes();
    await mapPoolIndexHandler(
      makeReq({
        method: 'POST',
        body: { game: 'valorant', map_name: 'Split' },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect((store.tenant_map_pool as any).length).toBe(2);
  });

  it('400 on invalid game slug', async () => {
    const res = makeRes();
    await mapPoolIndexHandler(
      makeReq({
        method: 'POST',
        body: { game: 'nope', map_name: 'X' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GAME');
  });

  it('400 on missing map_name', async () => {
    const res = makeRes();
    await mapPoolIndexHandler(
      makeReq({
        method: 'POST',
        body: { game: 'overwatch' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
  });

  it('405 on unsupported method', async () => {
    const res = makeRes();
    await mapPoolIndexHandler(makeReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * PATCH / DELETE [mapId]
 * ---------------------------------------------------------*/

describe('PATCH /api/admin/map-pool/[mapId]', () => {
  it('200 updates fields (own tenant)', async () => {
    store.tenant_map_pool = [
      {
        id: MAP_ID,
        game: 'overwatch',
        map_name: 'Old',
        enabled: true,
        order_index: 0,
      },
    ] as any;

    const res = makeRes();
    await mapPoolItemHandler(
      makeReq({
        method: 'PATCH',
        query: { mapId: MAP_ID },
        body: { map_name: 'New', enabled: false },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((store.tenant_map_pool[0] as any).map_name).toBe('New');
    expect((store.tenant_map_pool[0] as any).enabled).toBe(false);
    expect((store.tenant_map_pool[0] as any).updated_at).toBeTruthy();
  });

  it('404 when the map belongs to another tenant', async () => {
    store.tenant_map_pool = [
      {
        id: OTHER_MAP_ID,
        tenant_id: OTHER_TENANT,
        game: 'overwatch',
        map_name: 'Foreign',
      },
    ] as any;

    const res = makeRes();
    await mapPoolItemHandler(
      makeReq({
        method: 'PATCH',
        query: { mapId: OTHER_MAP_ID },
        body: { enabled: false },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('UNKNOWN_MAP');
    // Row inchangée.
    expect((store.tenant_map_pool[0] as any).map_name).toBe('Foreign');
  });

  it('400 on invalid map id', async () => {
    const res = makeRes();
    await mapPoolItemHandler(
      makeReq({
        method: 'PATCH',
        query: { mapId: 'bogus' },
        body: { enabled: true },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when nothing to update', async () => {
    store.tenant_map_pool = [
      { id: MAP_ID, game: 'overwatch', map_name: 'X' },
    ] as any;
    const res = makeRes();
    await mapPoolItemHandler(
      makeReq({ method: 'PATCH', query: { mapId: MAP_ID }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/admin/map-pool/[mapId]', () => {
  it('200 { ok: true } removes the map (own tenant)', async () => {
    store.tenant_map_pool = [
      { id: MAP_ID, game: 'overwatch', map_name: 'X' },
    ] as any;

    const res = makeRes();
    await mapPoolItemHandler(
      makeReq({ method: 'DELETE', query: { mapId: MAP_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).ok).toBe(true);
    expect((store.tenant_map_pool as any).length).toBe(0);
  });

  it('404 when deleting another tenant map (no deletion)', async () => {
    store.tenant_map_pool = [
      {
        id: OTHER_MAP_ID,
        tenant_id: OTHER_TENANT,
        game: 'overwatch',
        map_name: 'Foreign',
      },
    ] as any;

    const res = makeRes();
    await mapPoolItemHandler(
      makeReq({ method: 'DELETE', query: { mapId: OTHER_MAP_ID } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect((store.tenant_map_pool as any).length).toBe(1);
  });

  it('405 on unsupported method', async () => {
    const res = makeRes();
    await mapPoolItemHandler(
      makeReq({ method: 'GET', query: { mapId: MAP_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * import-defaults
 * ---------------------------------------------------------*/

describe('POST /api/admin/map-pool/import-defaults', () => {
  it('imports the full config/games pool when empty', async () => {
    const expected = getGame('overwatch')!.mapPool.length;

    const res = makeRes();
    await importDefaultsHandler(
      makeReq({ method: 'POST', body: { game: 'overwatch' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).imported).toBe(expected);
    expect((res.body as any).skipped).toBe(0);
    expect((res.body as any).maps).toHaveLength(expected);
    expect((store.tenant_map_pool as any).length).toBe(expected);
  });

  it('is idempotent: a second call skips everything', async () => {
    const expected = getGame('overwatch')!.mapPool.length;

    const res1 = makeRes();
    await importDefaultsHandler(
      makeReq({ method: 'POST', body: { game: 'overwatch' } }),
      res1
    );
    expect((res1.body as any).imported).toBe(expected);

    const res2 = makeRes();
    await importDefaultsHandler(
      makeReq({ method: 'POST', body: { game: 'overwatch' } }),
      res2
    );
    expect(res2.statusCode).toBe(200);
    expect((res2.body as any).imported).toBe(0);
    expect((res2.body as any).skipped).toBe(expected);
    // Pas de doublon en base.
    expect((store.tenant_map_pool as any).length).toBe(expected);
  });

  it('skips only the maps already present (partial import)', async () => {
    const pool = getGame('overwatch')!.mapPool;
    store.tenant_map_pool = [
      { id: 'seed', game: 'overwatch', map_name: pool[0].name, order_index: 0 },
    ] as any;

    const res = makeRes();
    await importDefaultsHandler(
      makeReq({ method: 'POST', body: { game: 'overwatch' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).imported).toBe(pool.length - 1);
    expect((res.body as any).skipped).toBe(1);
    expect((store.tenant_map_pool as any).length).toBe(pool.length);
  });

  it('400 on invalid game', async () => {
    const res = makeRes();
    await importDefaultsHandler(
      makeReq({ method: 'POST', body: { game: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await importDefaultsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
