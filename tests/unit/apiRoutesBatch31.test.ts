import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import tournamentMapsHandler from '../../pages/api/tournament/[id]/maps';
import advanceHandler from '../../pages/api/admin/stages/[stageId]/advance';
import { getGame } from '../../config/games';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

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

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
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
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

const TID = '550e8400-e29b-41d4-a716-446655440000';
const STAGE_ID = '550e8400-e29b-41d4-a716-446655440001';

/* -----------------------------------------------------------
 * /api/tournament/[id]/maps
 * ---------------------------------------------------------*/

describe('/api/tournament/[id]/maps', () => {
  it('400 on missing id', async () => {
    const res = makeRes();
    await tournamentMapsHandler(makeReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 lists all maps for the tournament', async () => {
    store.tournament_maps = [
      {
        id: 'map-1',
        tournament_id: TID,
        map_name: 'Lijiang',
        order_index: 0,
        enabled: true,
      },
      {
        id: 'map-2',
        tournament_id: TID,
        map_name: 'Hanamura',
        order_index: 1,
        enabled: false,
      },
    ] as any;
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).maps).toHaveLength(2);
  });

  it('POST 400 when map_name missing', async () => {
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 inserts a new map with auto order_index', async () => {
    store.tournament_maps = [
      {
        id: 'map-1',
        tournament_id: TID,
        map_name: 'Lijiang',
        order_index: 5,
      },
    ] as any;
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { map_name: 'Hanamura', map_type: 'assault' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.tournament_maps as any).find(
      (m: any) => m.map_name === 'Hanamura'
    );
    expect(inserted).toBeTruthy();
    expect(inserted.order_index).toBe(6);
    expect(inserted.enabled).toBe(true);
  });

  it('PUT 400 when maps not an array', async () => {
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'PUT',
        query: { id: TID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 200 replaces all maps for the tournament', async () => {
    store.tournament_maps = [
      { id: 'old-1', tournament_id: TID, map_name: 'Old1' },
      { id: 'old-2', tournament_id: TID, map_name: 'Old2' },
      // Some other tournament's maps should be untouched
      { id: 'other', tournament_id: 'tour-other', map_name: 'Other' },
    ] as any;
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'PUT',
        query: { id: TID },
        body: {
          maps: [
            { map_name: 'New1' },
            { map_name: 'New2', enabled: false, order_index: 9 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const remaining = (store.tournament_maps as any).filter(
      (m: any) => m.tournament_id === TID
    );
    expect(remaining).toHaveLength(2);
    expect(remaining.map((m: any) => m.map_name).sort()).toEqual([
      'New1',
      'New2',
    ]);
    // Other tournament's map preserved
    const other = (store.tournament_maps as any).find(
      (m: any) => m.id === 'other'
    );
    expect(other).toBeTruthy();
  });

  it('PATCH 400 when mapId missing', async () => {
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TID },
        body: { map_name: 'X' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when no fields to update', async () => {
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TID, mapId: 'map-1' },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates map fields', async () => {
    store.tournament_maps = [
      {
        id: 'map-1',
        tournament_id: TID,
        map_name: 'Old',
        enabled: true,
      },
    ] as any;
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TID, mapId: 'map-1' },
        body: { map_name: 'New', enabled: false },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_maps[0] as any).map_name).toBe('New');
    expect((store.tournament_maps[0] as any).enabled).toBe(false);
  });

  it('DELETE one removes a single map', async () => {
    store.tournament_maps = [
      { id: 'map-1', tournament_id: TID, map_name: 'A' },
      { id: 'map-2', tournament_id: TID, map_name: 'B' },
    ] as any;
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'DELETE',
        query: { id: TID, mapId: 'map-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_maps as any).length).toBe(1);
    expect((store.tournament_maps as any)[0].id).toBe('map-2');
  });

  it('DELETE all without mapId removes all maps', async () => {
    store.tournament_maps = [
      { id: 'map-1', tournament_id: TID },
      { id: 'map-2', tournament_id: TID },
    ] as any;
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({ method: 'DELETE', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.tournament_maps as any).filter((m: any) => m.tournament_id === TID)
    ).toHaveLength(0);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({ method: 'OPTIONS' as any, query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * POST { defaults: true } — ajout groupé des maps par défaut
 * Source prioritaire = tenant_map_pool, fallback = config/games.
 * ---------------------------------------------------------*/

describe('POST /api/tournament/[id]/maps { defaults: true }', () => {
  it('404 when tournament not found', async () => {
    store.tournaments = [];
    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { defaults: true },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('uses tenant_map_pool (enabled only) when it has rows → source=tenant', async () => {
    store.tournaments = [{ id: TID, game: 'overwatch' }] as any;
    store.tournament_maps = [];
    store.tenant_map_pool = [
      {
        id: 'p1',
        game: 'overwatch',
        map_name: 'Custom A',
        map_type: 'control',
        image_url: 'a.jpg',
        enabled: true,
        order_index: 0,
      },
      {
        id: 'p2',
        game: 'overwatch',
        map_name: 'Custom B',
        map_type: 'push',
        image_url: 'b.jpg',
        enabled: true,
        order_index: 1,
      },
      // Désactivée → ne doit pas être ajoutée.
      {
        id: 'p3',
        game: 'overwatch',
        map_name: 'Disabled',
        enabled: false,
        order_index: 2,
      },
    ] as any;

    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { defaults: true },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).source).toBe('tenant');
    expect((res.body as any).imported).toBe(2);
    const names = (store.tournament_maps as any)
      .filter((m: any) => m.tournament_id === TID)
      .map((m: any) => m.map_name)
      .sort();
    expect(names).toEqual(['Custom A', 'Custom B']);
  });

  it('falls back to config/games when tenant pool is empty → source=defaults', async () => {
    store.tournaments = [{ id: TID, game: 'overwatch' }] as any;
    store.tournament_maps = [];
    store.tenant_map_pool = [];

    const expected = getGame('overwatch')!.mapPool.length;

    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { defaults: true },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).source).toBe('defaults');
    expect((res.body as any).imported).toBe(expected);
    expect(
      (store.tournament_maps as any).filter((m: any) => m.tournament_id === TID)
    ).toHaveLength(expected);
  });

  it('skips maps already present on the tournament (case-insensitive dedup)', async () => {
    store.tournaments = [{ id: TID, game: 'overwatch' }] as any;
    store.tenant_map_pool = [
      {
        id: 'p1',
        game: 'overwatch',
        map_name: 'Busan',
        enabled: true,
        order_index: 0,
      },
      {
        id: 'p2',
        game: 'overwatch',
        map_name: 'Nepal',
        enabled: true,
        order_index: 1,
      },
    ] as any;
    store.tournament_maps = [
      { id: 'm1', tournament_id: TID, map_name: 'busan', order_index: 0 },
    ] as any;

    const res = makeRes();
    await tournamentMapsHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { defaults: true },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).imported).toBe(1);
    const names = (store.tournament_maps as any)
      .filter((m: any) => m.tournament_id === TID)
      .map((m: any) => m.map_name.toLowerCase())
      .sort();
    expect(names).toEqual(['busan', 'nepal']);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/advance
 * ---------------------------------------------------------*/

describe('POST /api/admin/stages/[stageId]/advance', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await advanceHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await advanceHandler(
      makeReq({ method: 'POST', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when source stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { auto: true },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when auto mode but advancement_rules missing', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
      },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { auto: true },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when manual mode but no teamIds provided (route requires either auto or teamIds+targetStageId)', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
      },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {},
      }),
      res
    );
    expect([400, 404, 500].includes(res.statusCode)).toBe(true);
  });

  // Régression : le client câble un `Idempotency-Key` sur ce POST mutateur de
  // bracket. Le handler étant désormais wrappé par withAdminIdempotency, un
  // rejeu (même clé + même body) doit rejouer la réponse cache et NE PAS
  // ré-insérer les équipes dans le stage cible.
  const TARGET_STAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
  const TEAM_ID = '550e8400-e29b-41d4-a716-446655440003';

  function seedAdvanceManualScenario() {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID, stage_type: 'group', settings: {} },
      { id: TARGET_STAGE_ID, tournament_id: TID, stage_type: 'bracket' },
    ] as any;
    store.stage_teams = [{ stage_id: STAGE_ID, team_id: TEAM_ID }] as any;
  }

  it('manual advance succeeds (baseline for idempotency test)', async () => {
    seedAdvanceManualScenario();
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: [TEAM_ID],
          seedMode: 'none',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).advanced).toHaveLength(1);
    // 1 row source + 1 row insérée dans le stage cible
    expect((store.stage_teams as any[]).length).toBe(2);
  });

  it('idempotent replay: same Idempotency-Key + body does not re-advance', async () => {
    seedAdvanceManualScenario();
    const idemKey = 'advance-idem-key-123';
    const body = {
      targetStageId: TARGET_STAGE_ID,
      teamIds: [TEAM_ID],
      seedMode: 'none',
    };

    // 1er appel : avance réellement (insère dans le stage cible).
    const res1 = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body,
        headers: {
          host: 'h',
          authorization: freshBearer(),
          'idempotency-key': idemKey,
        },
      }),
      res1
    );
    expect(res1.statusCode).toBe(200);
    expect((res1.body as any).advanced).toHaveLength(1);
    const afterFirst = (store.stage_teams as any[]).length;
    expect(afterFirst).toBe(2);

    // 2e appel : même clé + même body → replay cache, AUCUNE nouvelle insertion.
    const res2 = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body,
        headers: {
          host: 'h',
          authorization: freshBearer(),
          'idempotency-key': idemKey,
        },
      }),
      res2
    );
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['Idempotency-Replay']).toBe('true');
    expect((res2.body as any).advanced).toHaveLength(1);
    // Pas de double-avancement : toujours 2 rows (source + 1 cible).
    expect((store.stage_teams as any[]).length).toBe(afterFirst);
  });

  it('no Idempotency-Key → no replay (backward compatible)', async () => {
    seedAdvanceManualScenario();
    const body = {
      targetStageId: TARGET_STAGE_ID,
      teamIds: [TEAM_ID],
      seedMode: 'none',
    };
    const res1 = makeRes();
    await advanceHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID }, body }),
      res1
    );
    expect(res1.statusCode).toBe(200);
    expect(res1.headers['Idempotency-Replay']).toBeUndefined();
  });
});
