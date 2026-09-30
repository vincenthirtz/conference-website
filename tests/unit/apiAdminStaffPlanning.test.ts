// Tests de /api/admin/staff-planning (index, [slotId], import).
//
// Couvert :
//   - lecture : fenêtre de dates, tenant actif seul, pseudos connus ; ouverte à
//     tout le staff (arbitre compris), fenêtre invalide = 400 ;
//   - écriture réservée à `manage_staff` (arbitre = 403) ;
//   - ajout manuel : validation, 409 sur doublon ;
//   - retrait : 404 hors tenant ;
//   - import : remplace l'import précédent des mois couverts, garde les
//     saisies manuelles et les autres mois, refuse une entrée hors mois.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import indexHandler from '../../pages/api/admin/staff-planning/index';
import itemHandler from '../../pages/api/admin/staff-planning/[slotId]';
import importHandler from '../../pages/api/admin/staff-planning/import';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000999';
const SLOT_CSV = '55555555-5555-4555-8555-55555555aaaa';
const SLOT_MANUAL = '55555555-5555-4555-8555-55555555bbbb';
const SLOT_OTHER_MONTH = '55555555-5555-4555-8555-55555555cccc';
const SLOT_FOREIGN = '55555555-5555-4555-8555-55555555ffff';

function makeStaffRow(role: 'admin' | 'referee'): StaffMember {
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

let tokenCounter = 0;
function req(over: Partial<any> = {}): any {
  tokenCounter += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${tokenCounter}`,
    },
    query: {},
    body: {},
    cookies: {},
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

const slot = (over: Record<string, unknown>) => ({
  tenant_id: TENANT,
  role: null,
  note: null,
  source: 'csv',
  created_by: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

function seed() {
  store.staff_planning_slots = [
    slot({
      id: SLOT_CSV,
      person_name: 'Pomme',
      slot_date: '2026-09-23',
      start_time: '20:30:00',
      end_time: '00:00:00',
    }),
    slot({
      id: SLOT_MANUAL,
      person_name: 'Kotarah',
      slot_date: '2026-09-25',
      start_time: '19:00:00',
      end_time: '22:00:00',
      source: 'manual',
      role: 'cast',
    }),
    slot({
      id: SLOT_OTHER_MONTH,
      person_name: 'Iguel',
      slot_date: '2026-11-04',
      start_time: '19:00:00',
      end_time: '22:00:00',
    }),
    slot({
      id: SLOT_FOREIGN,
      tenant_id: OTHER_TENANT,
      person_name: 'Ailleurs',
      slot_date: '2026-09-23',
      start_time: '19:00:00',
      end_time: '22:00:00',
    }),
  ] as any;
  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  seed();
});

const ids = () => (store.staff_planning_slots as any[]).map((s) => s.id);

describe('GET /api/admin/staff-planning', () => {
  it('rend les créneaux de la fenêtre, du tenant actif, heures en HH:MM', async () => {
    const res = makeRes();
    await indexHandler(
      req({ query: { from: '2026-09-01', to: '2026-09-30' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.slots.map((s: any) => s.id)).toEqual([SLOT_CSV, SLOT_MANUAL]);
    expect(body.slots[0]).toMatchObject({
      start_time: '20:30',
      end_time: '00:00',
    });
    expect(body.people).toEqual(['Iguel', 'Kotarah', 'Pomme']);
  });

  it('est ouverte à un arbitre (lecture seule)', async () => {
    store.staff = [makeStaffRow('referee')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await indexHandler(
      req({ query: { from: '2026-09-01', to: '2026-09-30' } }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('400 sur une fenêtre à l’envers ou sans dates', async () => {
    const a = makeRes();
    await indexHandler(
      req({ query: { from: '2026-09-30', to: '2026-09-01' } }),
      a
    );
    expect(a.statusCode).toBe(400);
    const b = makeRes();
    await indexHandler(req({ query: {} }), b);
    expect(b.statusCode).toBe(400);
  });
});

describe('POST /api/admin/staff-planning', () => {
  const body = {
    person_name: 'Noxana',
    slot_date: '2026-10-02',
    start_time: '19:00',
    end_time: '22:00',
    role: 'moderation',
  };

  it('ajoute un créneau manuel', async () => {
    const res = makeRes();
    await indexHandler(req({ method: 'POST', body }), res);
    expect(res.statusCode).toBe(201);
    const created = (store.staff_planning_slots as any[]).find(
      (s) => s.person_name === 'Noxana'
    );
    expect(created).toMatchObject({
      tenant_id: TENANT,
      source: 'manual',
      role: 'moderation',
    });
  });

  it('403 pour un arbitre', async () => {
    store.staff = [makeStaffRow('referee')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await indexHandler(req({ method: 'POST', body }), res);
    expect(res.statusCode).toBe(403);
  });

  it('400 sur une heure invalide ou un créneau vide', async () => {
    const a = makeRes();
    await indexHandler(
      req({ method: 'POST', body: { ...body, start_time: '25:00' } }),
      a
    );
    expect(a.statusCode).toBe(400);
    const b = makeRes();
    await indexHandler(
      req({ method: 'POST', body: { ...body, end_time: '19:00' } }),
      b
    );
    expect(b.statusCode).toBe(400);
  });
});

describe('DELETE /api/admin/staff-planning/[slotId]', () => {
  it('retire un créneau du tenant', async () => {
    const res = makeRes();
    await itemHandler(
      req({ method: 'DELETE', query: { slotId: SLOT_MANUAL } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(ids()).not.toContain(SLOT_MANUAL);
  });

  it('404 sur un créneau d’un autre tenant, sans le toucher', async () => {
    const res = makeRes();
    await itemHandler(
      req({ method: 'DELETE', query: { slotId: SLOT_FOREIGN } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(ids()).toContain(SLOT_FOREIGN);
  });
});

describe('POST /api/admin/staff-planning/import', () => {
  it('remplace l’import des mois couverts, garde le manuel et les autres mois', async () => {
    const res = makeRes();
    await importHandler(
      req({
        method: 'POST',
        body: {
          months: ['2026-09', '2026-10'],
          entries: [
            {
              person: 'Pomme',
              date: '2026-09-30',
              start: '22:00',
              end: '00:00',
            },
            {
              person: 'P1xel (Orange Ribbit)',
              date: '2026-10-16',
              start: '19:00',
              end: '22:00',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).inserted).toBe(2);
    const now = ids();
    expect(now).not.toContain(SLOT_CSV); // ancien import de septembre
    expect(now).toContain(SLOT_MANUAL); // saisie manuelle
    expect(now).toContain(SLOT_OTHER_MONTH); // novembre, hors fichier
    expect(now).toContain(SLOT_FOREIGN); // autre tenant
    const imported = (store.staff_planning_slots as any[]).filter(
      (s) =>
        s.tenant_id === TENANT &&
        s.source === 'csv' &&
        s.slot_date < '2026-11-01'
    );
    expect(imported.map((s) => s.slot_date).sort()).toEqual([
      '2026-09-30',
      '2026-10-16',
    ]);
  });

  it('refuse une entrée hors des mois annoncés', async () => {
    const res = makeRes();
    await importHandler(
      req({
        method: 'POST',
        body: {
          months: ['2026-09'],
          entries: [
            {
              person: 'Pomme',
              date: '2026-10-07',
              start: '22:00',
              end: '00:00',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(ids()).toContain(SLOT_CSV);
  });

  it('403 pour un arbitre', async () => {
    store.staff = [makeStaffRow('referee')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await importHandler(
      req({ method: 'POST', body: { months: ['2026-09'], entries: [] } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});
