// /api/tournament/[id]/maps — POOL PAR JOURNÉE.
//
// La colonne `tournament_maps.round_number` existait, mais cette route ne la
// connaissait pas : elle listait les journées mêlées au pool par défaut, et son
// DELETE sans `mapId` effaçait TOUS les pools d'un coup. Chaque test ci-dessous
// verrouille une opération dans son scope.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import { store, resetSupabaseMock, setAuthUser } from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/tournament/[id]/maps';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

const TID = '550e8400-e29b-41d4-a716-446655440000';
// Le staff de test n'a pas d'entrée `tenant_staff` : la route retombe sur le
// tenant par défaut, et les lignes doivent porter le même pour être visibles.
const TENANT = DEFAULT_TENANT_ID;

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
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tokenCounter}` },
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

/** Une ligne de pool. `round` null = pool par défaut du tournoi. */
function mapRow(id: string, name: string, round: number | null, order = 0) {
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
    round_number: round,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.tournaments = [{ id: TID, tenant_id: TENANT, name: 'Cup', slug: 'cup', game: 'overwatch' }] as any;
  store.tournament_maps = [
    mapRow('d1', 'Oasis', null, 0),
    mapRow('d2', 'Nepal', null, 1),
    mapRow('r1-1', 'Nepal', 1, 0),
    mapRow('r2-1', 'Oasis', 2, 0),
    mapRow('r2-2', 'Havana', 2, 1),
  ] as any;
  store.matches = [
    { id: 'm1', tournament_id: TID, tenant_id: TENANT, round_number: 1, round_name: 'J1', scheduled_at: '2026-09-18T17:00:00Z' },
    { id: 'm2', tournament_id: TID, tenant_id: TENANT, round_number: 2, round_name: 'J2', scheduled_at: '2026-09-23T18:30:00Z' },
    { id: 'm3', tournament_id: TID, tenant_id: TENANT, round_number: 2, round_name: 'J2', scheduled_at: '2026-09-25T17:00:00Z' },
  ] as any;
});

function names(round: number | null): string[] {
  return (store.tournament_maps as any[])
    .filter((m) => m.tournament_id === TID && (m.round_number ?? null) === round)
    .map((m) => m.map_name)
    .sort();
}

describe('GET — scope du pool', () => {
  it('sans ?round : le pool PAR DÉFAUT seul, pas les journées', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.maps.map((m: any) => m.map_name).sort()).toEqual(['Nepal', 'Oasis']);
    expect(body.round).toBeNull();
  });

  it('?round=2 : le pool de la journée 2 seul', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID, round: '2' } }), res);
    const body = res.body as any;
    expect(body.maps.map((m: any) => m.map_name).sort()).toEqual(['Havana', 'Oasis']);
    expect(body.round).toBe(2);
  });

  it('expose les journées du PLANNING avec leur nombre de cartes', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID } }), res);
    const rounds = (res.body as any).rounds;
    expect(rounds).toEqual([
      { round: 1, label: 'J1', days: ['2026-09-18'], mapsCount: 1 },
      { round: 2, label: 'J2', days: ['2026-09-23', '2026-09-25'], mapsCount: 2 },
    ]);
  });

  it('400 sur un ?round illisible, plutôt que de viser le pool par défaut', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: TID, round: 'deux' } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('POST — ajout dans la journée', () => {
  it('écrit round_number et numérote DANS la journée', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        query: { id: TID, round: '2' },
        body: { map_name: 'Rialto', map_type: 'escort' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = (store.tournament_maps as any[]).find((m) => m.map_name === 'Rialto');
    expect(created.round_number).toBe(2);
    // J2 avait deux cartes (index 0 et 1) : la suivante est 2, et non 2 hérité
    // du pool par défaut.
    expect(created.order_index).toBe(2);
    expect(names(null)).toEqual(['Nepal', 'Oasis']);
  });

  it('sans ?round, écrit dans le pool par défaut', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', query: { id: TID }, body: { map_name: 'Rialto' } }),
      res
    );
    const created = (store.tournament_maps as any[]).find((m) => m.map_name === 'Rialto');
    expect(created.round_number).toBeNull();
  });
});

describe('POST { defaults: true } — remplir une journée', () => {
  it('une journée se remplit depuis le POOL DU TOURNOI, pas le catalogue du jeu', async () => {
    store.tournament_maps = [
      mapRow('d1', 'Oasis', null, 0),
      mapRow('d2', 'Nepal', null, 1),
    ] as any;
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', query: { id: TID, round: '3' }, body: { defaults: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Les 30 cartes du catalogue Overwatch ne doivent PAS débarquer : seules
    // les deux retenues pour la compétition.
    expect(names(3)).toEqual(['Nepal', 'Oasis']);
    expect((res.body as any).imported).toBe(2);
  });

  it('la dédup est scopée : une carte du pool par défaut n’empêche pas de remplir la journée', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', query: { id: TID, round: '1' }, body: { defaults: true } }),
      res
    );
    // J1 avait déjà Nepal ; Oasis manquait et doit arriver.
    expect(names(1)).toEqual(['Nepal', 'Oasis']);
  });
});

describe('DELETE — la suppression en masse ne déborde pas', () => {
  // LE test de ce lot : « supprimer toutes les maps » effaçait les pools de
  // toutes les journées avec le pool par défaut.
  it('sans mapId ni ?round : vide le pool par défaut, PRÉSERVE les journées', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    expect(names(null)).toEqual([]);
    expect(names(1)).toEqual(['Nepal']);
    expect(names(2)).toEqual(['Havana', 'Oasis']);
  });

  it('?round=2 : vide la journée 2, PRÉSERVE le pool par défaut et J1', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', query: { id: TID, round: '2' } }), res);
    expect(names(2)).toEqual([]);
    expect(names(null)).toEqual(['Nepal', 'Oasis']);
    expect(names(1)).toEqual(['Nepal']);
  });

  it('avec mapId : supprime cette carte seule', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE', query: { id: TID, mapId: 'r2-1' } }), res);
    expect(names(2)).toEqual(['Havana']);
    expect(names(null)).toEqual(['Nepal', 'Oasis']);
  });
});

describe('PUT — remplacement scopé', () => {
  it('?round=2 : remplace la journée 2 sans toucher au reste', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        query: { id: TID, round: '2' },
        body: { maps: [{ map_name: 'Midtown', map_type: 'hybrid' }] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(names(2)).toEqual(['Midtown']);
    expect(names(null)).toEqual(['Nepal', 'Oasis']);
    expect(names(1)).toEqual(['Nepal']);
    const created = (store.tournament_maps as any[]).find((m) => m.map_name === 'Midtown');
    expect(created.round_number).toBe(2);
  });

  it('sans ?round : remplace le pool par défaut sans toucher aux journées', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'PUT', query: { id: TID }, body: { maps: [{ map_name: 'Busan' }] } }),
      res
    );
    expect(names(null)).toEqual(['Busan']);
    expect(names(2)).toEqual(['Havana', 'Oasis']);
  });
});
