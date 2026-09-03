// tests/unit/apiAdminRosterUnlock.test.ts
//
// POST/DELETE /api/admin/tournament/[id]/roster-unlock — fenêtre de
// déverrouillage temporaire du roster.
//
// Ce que ces tests protègent :
//   - la BORNE HAUTE. Une dérogation « une semaine » n'est plus une
//     dérogation, c'est un verrou déplacé — et pour ça il y a
//     `roster_locked_at`, qui a le mérite d'être visible dans les réglages ;
//   - le SCOPE TENANT. Sans filtre, un identifiant deviné déverrouillerait le
//     roster d'un autre espace ;
//   - le fait que la fenêtre parte de MAINTENANT : « encore 30 minutes » doit
//     vouloir dire 30 minutes, pas 30 de plus qu'un reste oublié ;
//   - la fermeture immédiate, parce qu'une fenêtre qui se referme seule doit
//     quand même pouvoir être coupée court.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import handler from '../../pages/api/admin/tournament/[id]/roster-unlock';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOURNAMENT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FOREIGN_TOURNAMENT = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const STAFF_ID = 'staff-1';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: { id: TOURNAMENT },
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
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
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'admin',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'conference', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
  store.tournaments = [
    {
      id: TOURNAMENT,
      tenant_id: TENANT,
      name: 'Coupe Hiver',
      roster_locked_at: new Date(Date.now() - 3_600_000).toISOString(),
      roster_unlocked_until: null,
    },
    {
      id: FOREIGN_TOURNAMENT,
      tenant_id: OTHER_TENANT,
      name: 'Ailleurs',
      roster_locked_at: new Date(Date.now() - 3_600_000).toISOString(),
      roster_unlocked_until: null,
    },
  ] as any;
});

describe('validation', () => {
  it('405 sur une méthode non gérée', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 sur un id de tournoi mal formé', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TOURNAMENT_ID');
  });

  it('refuse une durée hors bornes', async () => {
    for (const minutes of [0, 1, 24 * 60 + 1, 10_000]) {
      const res = makeRes();
      await handler(makeReq({ body: { minutes } }), res);
      expect(res.statusCode, `minutes=${minutes}`).toBe(400);
      expect((res.body as any).code).toBe('INVALID_MINUTES');
    }
  });

  it('refuse une durée non entière', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { minutes: 42.5 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404 sur un tournoi d’un AUTRE espace', async () => {
    // Sans le filtre tenant, un identifiant deviné déverrouillerait le roster
    // d'un espace voisin.
    const res = makeRes();
    await handler(makeReq({ query: { id: FOREIGN_TOURNAMENT } }), res);
    expect(res.statusCode).toBe(404);
    expect((store.tournaments as any[])[1].roster_unlocked_until).toBeNull();
  });
});

describe('ouverture', () => {
  it('ouvre une fenêtre à partir de maintenant', async () => {
    const before = Date.now();
    const res = makeRes();
    await handler(makeReq({ body: { minutes: 30 } }), res);

    expect(res.statusCode).toBe(200);
    const until = Date.parse((res.body as any).rosterUnlockedUntil);
    const minutes = (until - before) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30.5);

    expect(
      (store.tournaments as any[])[0].roster_unlocked_until
    ).toBeTruthy();
  });

  it('une durée absente prend le défaut d’une heure', async () => {
    const res = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).minutes).toBe(60);
  });

  it('ré-ouvrir repart de maintenant, sans cumuler', async () => {
    // « Encore 30 minutes » doit vouloir dire 30 minutes, pas 30 de plus qu'un
    // reste qu'on aurait oublié.
    (store.tournaments as any[])[0].roster_unlocked_until = new Date(
      Date.now() + 20 * 60_000
    ).toISOString();

    const res = makeRes();
    await handler(makeReq({ body: { minutes: 30 } }), res);
    const until = Date.parse((res.body as any).rosterUnlockedUntil);
    const minutes = (until - Date.now()) / 60_000;
    expect(minutes).toBeLessThanOrEqual(30.5);
  });
});

describe('fermeture', () => {
  it('DELETE referme la fenêtre immédiatement', async () => {
    (store.tournaments as any[])[0].roster_unlocked_until = new Date(
      Date.now() + 3_600_000
    ).toISOString();

    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).rosterUnlockedUntil).toBeNull();
    expect((store.tournaments as any[])[0].roster_unlocked_until).toBeNull();
  });

  it('DELETE sans fenêtre ouverte reste sans effet et sans erreur', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(200);
    expect((store.tournaments as any[])[0].roster_unlocked_until).toBeNull();
  });
});
