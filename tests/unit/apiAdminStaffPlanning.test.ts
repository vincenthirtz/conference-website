// Tests de /api/admin/staff-planning (index, [slotId], import).
//
// Couvert :
//   - lecture : fenêtre de dates, tenant actif seul, pseudos connus ; ouverte à
//     tout le staff (arbitre compris), fenêtre invalide = 400 ;
//   - écriture : `manage_staff` sur tout ; tout autre staff sur SES créneaux
//     (« Mes dispos » : pseudo = nom affiché), 403 sur ceux des autres ou
//     sans nom affiché ; import réservé à `manage_staff` ;
//   - soirs de match sans staff à venir (signal du badge d'alertes) ;
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
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { uncoveredMatchNightsAhead } from '../../features/admin/staff-planning/service';

import indexHandler from '../../pages/api/admin/staff-planning/index';
import itemHandler from '../../pages/api/admin/staff-planning/[slotId]';
import importHandler from '../../pages/api/admin/staff-planning/import';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000999';
const SLOT_CSV = '55555555-5555-4555-8555-55555555aaaa';
const SLOT_MANUAL = '55555555-5555-4555-8555-55555555bbbb';
const SLOT_OTHER_MONTH = '55555555-5555-4555-8555-55555555cccc';
const SLOT_FOREIGN = '55555555-5555-4555-8555-55555555ffff';

function makeStaffRow(
  role: 'admin' | 'referee',
  display_name: string | null = null
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name,
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
  store.matches = [
    // Mercredi 23/09 : deux matchs, 19:00 et 20:30 heure de Paris.
    {
      id: 'm1',
      tenant_id: TENANT,
      status: 'pending',
      scheduled_at: '2026-09-23T17:00:00Z',
    },
    {
      id: 'm2',
      tenant_id: TENANT,
      status: 'pending',
      scheduled_at: '2026-09-23T18:30:00Z',
    },
    // Vendredi 25/09 : un match annulé, ignoré.
    {
      id: 'm3',
      tenant_id: TENANT,
      status: 'cancelled',
      scheduled_at: '2026-09-25T17:00:00Z',
    },
    // Autre tenant : ignoré.
    {
      id: 'm4',
      tenant_id: OTHER_TENANT,
      status: 'pending',
      scheduled_at: '2026-09-30T17:00:00Z',
    },
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

describe('soirs de match', () => {
  it('GET rend les soirs de match du tenant, annulés exclus, heure de Paris', async () => {
    const res = makeRes();
    await indexHandler(
      req({ query: { from: '2026-09-01', to: '2026-09-30' } }),
      res
    );
    expect((res.body as any).matchNights).toEqual([
      { date: '2026-09-23', count: 2, first: '19:00' },
    ]);
  });
});

describe('PATCH /api/admin/staff-planning/[slotId]', () => {
  it('pose un rôle et une note sur un créneau importé', async () => {
    const res = makeRes();
    await itemHandler(
      req({
        method: 'PATCH',
        query: { slotId: SLOT_CSV },
        body: { role: 'cast', note: 'Cast principal' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).slot).toMatchObject({
      role: 'cast',
      note: 'Cast principal',
      start_time: '20:30',
    });
  });

  it('400 sur un corps vide, 404 hors tenant, 403 pour un arbitre', async () => {
    const empty = makeRes();
    await itemHandler(
      req({ method: 'PATCH', query: { slotId: SLOT_CSV }, body: {} }),
      empty
    );
    expect(empty.statusCode).toBe(400);

    const foreign = makeRes();
    await itemHandler(
      req({
        method: 'PATCH',
        query: { slotId: SLOT_FOREIGN },
        body: { role: 'cast' },
      }),
      foreign
    );
    expect(foreign.statusCode).toBe(404);

    store.staff = [makeStaffRow('referee')] as any;
    invalidateStaffCache();
    const denied = makeRes();
    await itemHandler(
      req({
        method: 'PATCH',
        query: { slotId: SLOT_CSV },
        body: { role: 'cast' },
      }),
      denied
    );
    expect(denied.statusCode).toBe(403);
  });
});

describe('POST /api/admin/staff-planning — répétition hebdomadaire', () => {
  it('crée le créneau chaque semaine jusqu’à la date, sans doublonner', async () => {
    // Postgres compare des `time` (19:00 = 19:00:00) ; le mock compare des
    // chaînes : on aligne le format de la saisie manuelle existante.
    const manual = (store.staff_planning_slots as any[]).find(
      (x) => x.id === SLOT_MANUAL
    );
    manual.start_time = '19:00';
    const res = makeRes();
    await indexHandler(
      req({
        method: 'POST',
        body: {
          person_name: 'Kotarah',
          slot_date: '2026-09-18',
          start_time: '19:00',
          end_time: '22:00',
          repeat_until: '2026-10-09',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    // 18/09, 25/09 (déjà pris à 19:00 par la saisie manuelle), 02/10, 09/10.
    expect(res.body).toMatchObject({ created: 3, skipped: 1 });
    const dates = (store.staff_planning_slots as any[])
      .filter((x) => x.person_name === 'Kotarah')
      .map((x) => x.slot_date)
      .sort();
    expect(dates).toEqual([
      '2026-09-18',
      '2026-09-25',
      '2026-10-02',
      '2026-10-09',
    ]);
  });

  it('400 si la fin de répétition précède le premier jour', async () => {
    const res = makeRes();
    await indexHandler(
      req({
        method: 'POST',
        body: {
          person_name: 'Kotarah',
          slot_date: '2026-10-09',
          start_time: '19:00',
          end_time: '22:00',
          repeat_until: '2026-10-01',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('« Mes dispos » — un staff sans manage_staff sur ses créneaux', () => {
  // Arbitre dont le nom affiché est « pomme » : le pseudo du tableur est
  // « Pomme » (casse ignorée).
  beforeEach(() => {
    store.staff = [makeStaffRow('referee', ' pomme ')] as any;
    invalidateStaffCache();
  });

  const mine = {
    person_name: 'Pomme',
    slot_date: '2026-10-02',
    start_time: '19:00',
    end_time: '22:00',
  };

  it('GET rend le nom affiché du lecteur (`me`)', async () => {
    const res = makeRes();
    await indexHandler(
      req({ query: { from: '2026-09-01', to: '2026-09-30' } }),
      res
    );
    expect((res.body as any).me).toBe('pomme');
  });

  it('ajoute SA dispo, garde la graphie du planning', async () => {
    const res = makeRes();
    await indexHandler(req({ method: 'POST', body: mine }), res);
    expect(res.statusCode).toBe(201);
    expect(
      (store.staff_planning_slots as any[]).find(
        (s) => s.slot_date === '2026-10-02'
      )
    ).toMatchObject({ person_name: 'Pomme', source: 'manual' });
  });

  it('403 pour la dispo de quelqu’un d’autre, sans rien écrire', async () => {
    const before = ids().length;
    const res = makeRes();
    await indexHandler(
      req({ method: 'POST', body: { ...mine, person_name: 'Kotarah' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(ids()).toHaveLength(before);
  });

  it('modifie et retire SES créneaux, pas ceux des autres', async () => {
    const own = makeRes();
    await itemHandler(
      req({
        method: 'PATCH',
        query: { slotId: SLOT_CSV },
        body: { note: 'Dispo tard' },
      }),
      own
    );
    expect(own.statusCode).toBe(200);
    expect((own.body as any).slot.note).toBe('Dispo tard');

    const other = makeRes();
    await itemHandler(
      req({
        method: 'PATCH',
        query: { slotId: SLOT_MANUAL },
        body: { note: 'piraté' },
      }),
      other
    );
    expect(other.statusCode).toBe(403);
    expect(
      (store.staff_planning_slots as any[]).find((s) => s.id === SLOT_MANUAL)
        .note
    ).toBeNull();

    const delOther = makeRes();
    await itemHandler(
      req({ method: 'DELETE', query: { slotId: SLOT_MANUAL } }),
      delOther
    );
    expect(delOther.statusCode).toBe(403);
    expect(ids()).toContain(SLOT_MANUAL);

    const delOwn = makeRes();
    await itemHandler(
      req({ method: 'DELETE', query: { slotId: SLOT_CSV } }),
      delOwn
    );
    expect(delOwn.statusCode).toBe(200);
    expect(ids()).not.toContain(SLOT_CSV);
  });

  it('404 (et non 403) sur un créneau d’un autre tenant', async () => {
    const res = makeRes();
    await itemHandler(
      req({ method: 'DELETE', query: { slotId: SLOT_FOREIGN } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(ids()).toContain(SLOT_FOREIGN);
  });

  it('l’import reste réservé à manage_staff', async () => {
    const res = makeRes();
    await importHandler(
      req({ method: 'POST', body: { months: ['2026-09'], entries: [] } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('soirs de match sans staff à venir (badge d’alertes)', () => {
  const ctx = () => ({
    db: supabaseAdmin as any,
    tenantId: TENANT,
    actor: { kind: 'system' as const },
    logger: { error: () => {}, warn: () => {} } as any,
  });

  it('compte les soirs de match des 7 jours sans aucun créneau', async () => {
    store.matches = [
      ...(store.matches as any[]),
      // Lundi 21/09 : match, personne → non couvert.
      {
        id: 'm5',
        tenant_id: TENANT,
        status: 'pending',
        scheduled_at: '2026-09-21T18:00:00Z',
      },
      // 29/09 : hors des 7 jours à partir du 21/09.
      {
        id: 'm6',
        tenant_id: TENANT,
        status: 'pending',
        scheduled_at: '2026-09-29T18:00:00Z',
      },
    ] as any;
    // 23/09 : couvert par Pomme (SLOT_CSV). 25/09 : seul match annulé.
    const nights = await uncoveredMatchNightsAhead(ctx(), '2026-09-21');
    expect(nights.map((n) => n.date)).toEqual(['2026-09-21']);
  });

  it('aucun soir non couvert quand chaque soir de match a quelqu’un', async () => {
    const nights = await uncoveredMatchNightsAhead(ctx(), '2026-09-21');
    expect(nights).toEqual([]);
  });
});

describe('import — rapprochement', () => {
  it('un créneau toujours présent garde son id, son rôle et sa note', async () => {
    const pomme = (store.staff_planning_slots as any[]).find(
      (x) => x.id === SLOT_CSV
    );
    pomme.role = 'prod_obs';
    pomme.note = 'OBS';
    const res = makeRes();
    await importHandler(
      req({
        method: 'POST',
        body: {
          months: ['2026-09'],
          entries: [
            {
              person: 'Pomme',
              date: '2026-09-23',
              start: '20:30',
              end: '01:00',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ inserted: 0, kept: 1, removed: 0 });
    const kept = (store.staff_planning_slots as any[]).find(
      (x) => x.id === SLOT_CSV
    );
    expect(kept).toMatchObject({
      role: 'prod_obs',
      note: 'OBS',
      end_time: '01:00',
    });
  });
});
