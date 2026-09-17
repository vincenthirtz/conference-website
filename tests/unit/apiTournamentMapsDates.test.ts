// /api/tournament/[id]/maps — POOL PAR DATE (`?date=YYYY-MM-DD`).
//
// Pendant de apiTournamentMapsRounds.test.ts : chaque opération reste bornée à
// SON pool. Un pool daté ne doit ni apparaître dans le pool par défaut, ni être
// emporté par le « supprimer toutes les maps » d'un autre pool — et vice versa.

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
import handler from '../../pages/api/tournament/[id]/maps';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

const TID = '550e8400-e29b-41d4-a716-446655440000';
const TENANT = DEFAULT_TENANT_ID;
const D30 = '2026-09-30';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  _tokenCounter += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_tokenCounter}`,
    },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

type Scope = { round?: number; date?: string };

function mapRow(id: string, name: string, scope: Scope = {}, order = 0) {
  return {
    id,
    tournament_id: TID,
    tenant_id: TENANT,
    map_name: name,
    map_slug: null,
    map_type: 'control',
    image_url: null,
    enabled: true,
    order_index: order,
    round_number: scope.round ?? null,
    play_date: scope.date ?? null,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.tournaments = [
    { id: TID, tenant_id: TENANT, name: 'Cup', slug: 'cup', game: 'overwatch' },
  ] as any;
  store.tournament_maps = [
    mapRow('d1', 'Oasis', {}, 0),
    mapRow('d2', 'Nepal', {}, 1),
    mapRow('r2-1', 'Havana', { round: 2 }, 0),
    mapRow('t30-1', 'Busan', { date: D30 }, 0),
    mapRow('t30-2', 'Ilios', { date: D30 }, 1),
  ] as any;
  store.matches = [
    {
      id: 'm1',
      tournament_id: TID,
      tenant_id: TENANT,
      round_number: 2,
      round_name: 'J2',
      scheduled_at: '2026-09-23T18:30:00Z',
    },
    {
      id: 'm2',
      tournament_id: TID,
      tenant_id: TENANT,
      round_number: 2,
      round_name: 'J2',
      scheduled_at: '2026-09-30T17:00:00Z',
    },
    {
      id: 'm3',
      tournament_id: TID,
      tenant_id: TENANT,
      round_number: 3,
      round_name: 'J3',
      scheduled_at: '2026-09-30T19:00:00Z',
    },
  ] as any;
});

/** Cartes d'un pool : défaut `{}`, journée `{ round }`, date `{ date }`. */
function names(scope: Scope = {}): string[] {
  return (store.tournament_maps as any[])
    .filter(
      (m) =>
        m.tournament_id === TID &&
        (m.round_number ?? null) === (scope.round ?? null) &&
        (m.play_date ?? null) === (scope.date ?? null)
    )
    .map((m) => m.map_name)
    .sort();
}

describe('paramètres', () => {
  it('400 sur une date illisible, plutôt que de viser le pool par défaut', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID, date: '30/09' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 sur une date impossible', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID, date: '2026-02-31' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quand round ET date sont fournis — aucune écriture', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'DELETE', query: { id: TID, round: '2', date: D30 } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((store.tournament_maps as any[]).length).toBe(5);
  });
});

describe('GET', () => {
  it('sans paramètre : le pool par défaut SANS les lignes datées', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.maps.map((m: any) => m.map_name).sort()).toEqual([
      'Nepal',
      'Oasis',
    ]);
    expect(body.date).toBeNull();
  });

  it('?date= : le pool de la date seul', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID, date: D30 } }), res);
    const body = res.body as any;
    expect(body.maps.map((m: any) => m.map_name).sort()).toEqual([
      'Busan',
      'Ilios',
    ]);
    expect(body.date).toBe(D30);
    expect(body.round).toBeNull();
  });

  it('expose les dates du PLANNING avec leurs journées et leur nombre de cartes', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID } }), res);
    const body = res.body as any;
    expect(body.dates).toEqual([
      { date: '2026-09-23', rounds: ['J2'], mapsCount: 0 },
      { date: D30, rounds: ['J2', 'J3'], mapsCount: 2 },
    ]);
    // Les lignes datées ne gonflent pas le compteur des journées.
    expect(body.rounds.map((r: any) => [r.round, r.mapsCount, r.days])).toEqual(
      [
        [2, 1, ['2026-09-23', D30]],
        [3, 0, [D30]],
      ]
    );
  });
});

describe('POST', () => {
  it('écrit play_date (et pas round_number), numérote DANS la date', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        query: { id: TID, date: D30 },
        body: { map_name: 'Rialto', map_type: 'escort' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = (store.tournament_maps as any[]).find(
      (m) => m.map_name === 'Rialto'
    );
    expect(created.play_date).toBe(D30);
    expect(created.round_number).toBeNull();
    expect(created.order_index).toBe(2);
    expect(names()).toEqual(['Nepal', 'Oasis']);
  });

  it('{ defaults: true } remplit la date depuis le POOL DU TOURNOI', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        query: { id: TID, date: '2026-09-23' },
        body: { defaults: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(names({ date: '2026-09-23' })).toEqual(['Nepal', 'Oasis']);
    expect((res.body as any).source).toBe('tournament');
    // Le pool par défaut, J2 et le 30/09 n'ont pas bougé.
    expect(names()).toEqual(['Nepal', 'Oasis']);
    expect(names({ round: 2 })).toEqual(['Havana']);
    expect(names({ date: D30 })).toEqual(['Busan', 'Ilios']);
  });
});

describe('DELETE en masse — bornée au pool ciblé', () => {
  it('?date= vide la date, PRÉSERVE défaut et journées', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'DELETE', query: { id: TID, date: D30 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(names({ date: D30 })).toEqual([]);
    expect(names()).toEqual(['Nepal', 'Oasis']);
    expect(names({ round: 2 })).toEqual(['Havana']);
  });

  it('sans paramètre : vide le pool par défaut, PRÉSERVE la date', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', query: { id: TID } }), res);
    expect(names()).toEqual([]);
    expect(names({ date: D30 })).toEqual(['Busan', 'Ilios']);
    expect(names({ round: 2 })).toEqual(['Havana']);
  });

  it('?round=2 : PRÉSERVE la date', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'DELETE', query: { id: TID, round: '2' } }),
      res
    );
    expect(names({ round: 2 })).toEqual([]);
    expect(names({ date: D30 })).toEqual(['Busan', 'Ilios']);
  });
});

describe('PUT — remplacement scopé', () => {
  it('?date= remplace la date sans toucher au reste', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        query: { id: TID, date: D30 },
        body: { maps: [{ map_name: 'Midtown', map_type: 'hybrid' }] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(names({ date: D30 })).toEqual(['Midtown']);
    expect(names()).toEqual(['Nepal', 'Oasis']);
    expect(names({ round: 2 })).toEqual(['Havana']);
  });

  it('sans paramètre : remplace le pool par défaut sans toucher à la date', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        query: { id: TID },
        body: { maps: [{ map_name: 'Suravasa' }] },
      }),
      res
    );
    expect(names()).toEqual(['Suravasa']);
    expect(names({ date: D30 })).toEqual(['Busan', 'Ilios']);
  });
});
