// tests/unit/adminQueueAssignment.test.ts
//
// « Je prends » / « Libérer » sur les files de traitement :
//   POST /api/admin/demandes/[id]/assign
//   POST /api/admin/support/tickets/[id]/assign
//
// Ce que ces tests protègent : un dossier libre se prend, un dossier déjà pris
// par quelqu'un d'autre ne se vole pas (409 nommant la personne), la libération
// vide l'assignation, l'espace borne tout (404 hors tenant), le geste est
// journalisé avec l'assignation précédente — et, sans la migration, la route
// répond 503 au lieu d'une 500.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logStaffAction } = vi.hoisted(() => ({
  logStaffAction: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction }));

import {
  resetSupabaseMock,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import demandeAssign from '../../pages/api/admin/demandes/[id]/assign';
import ticketAssign from '../../pages/api/admin/support/tickets/[id]/assign';
import {
  isMissingColumnError,
  setAssignment,
  withAssignmentFallback,
} from '../../features/admin/_shared/staffAssignment';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '5b0c1d2e-3f40-4a51-8b62-7c83d94ea5f6';
const ID = '0f6d2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
const ME = 'staff-1';
const OTHER = 'staff-2';

let n = 0;
function makeReq(action: unknown, over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer assign-${n}` },
    cookies: {},
    query: { id: ID },
    body: { action },
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
  logStaffAction.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  setAuthUser({ id: 'user-1' });
  store.staff = [
    {
      id: ME,
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'admin',
      display_name: 'Moi',
      is_active: true,
      deleted_at: null,
    },
    {
      id: OTHER,
      auth_user_id: 'user-2',
      email: 'b@b.com',
      role: 'admin',
      display_name: 'Camille',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'conf', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: ME, role: 'admin' },
  ] as any;
});

const cases = [
  { name: 'demandes', table: 'demandes', handler: demandeAssign },
  { name: 'tickets support', table: 'support_tickets', handler: ticketAssign },
] as const;

describe.each(cases)('assignation — $name', ({ table, handler }) => {
  function seed(over: Record<string, unknown> = {}) {
    store[table] = [
      {
        id: ID,
        tenant_id: TENANT,
        status: table === 'demandes' ? 'pending' : 'open',
        assigned_staff_id: null,
        assigned_at: null,
        ...over,
      },
    ] as any;
  }

  it('« Je prends » sur un dossier libre, journalisé', async () => {
    seed();
    const res = makeRes();
    await handler(makeReq('claim'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.assignment).toMatchObject({
      assigned_staff_id: ME,
      assigned_to: { id: ME, display_name: 'Moi' },
    });
    expect((store[table] as any)[0].assigned_at).toBeTruthy();
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: ME,
        entity_id: ID,
        payload: expect.objectContaining({
          assignment: 'claim',
          previous_staff_id: null,
          assigned_staff_id: ME,
        }),
      })
    );
  });

  it('un dossier pris par quelqu’un d’autre ne se vole pas (409)', async () => {
    seed({ assigned_staff_id: OTHER, assigned_at: '2026-10-01T10:00:00Z' });
    const res = makeRes();
    await handler(makeReq('claim'), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('Camille');
    expect((store[table] as any)[0].assigned_staff_id).toBe(OTHER);
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('reprendre son propre dossier ne remet pas l’horloge à zéro', async () => {
    seed({ assigned_staff_id: ME, assigned_at: '2026-10-01T10:00:00Z' });
    const res = makeRes();
    await handler(makeReq('claim'), res);
    expect(res.statusCode).toBe(200);
    expect((store[table] as any)[0].assigned_at).toBe('2026-10-01T10:00:00Z');
  });

  it('« Libérer » vide l’assignation, et garde la trace de la personne', async () => {
    seed({ assigned_staff_id: OTHER, assigned_at: '2026-10-01T10:00:00Z' });
    const res = makeRes();
    await handler(makeReq('release'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.assignment).toMatchObject({
      assigned_staff_id: null,
      assigned_at: null,
      assigned_to: null,
    });
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          assignment: 'release',
          previous_staff_id: OTHER,
        }),
      })
    );
  });

  it('un dossier d’un autre espace répond 404', async () => {
    seed({ tenant_id: OTHER_TENANT });
    const res = makeRes();
    await handler(makeReq('claim'), res);
    expect(res.statusCode).toBe(404);
  });

  it('refuse une action inconnue (400) et une autre méthode (405)', async () => {
    seed();
    let res = makeRes();
    await handler(makeReq('steal'), res);
    expect(res.statusCode).toBe(400);
    res = makeRes();
    await handler(makeReq('claim', { method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* ---- Migration absente ---- */

const missingColumn = {
  code: '42703',
  message: 'column demandes.assigned_staff_id does not exist',
};

function fakeDb(readError: unknown) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: readError }),
  };
  return { from: () => builder } as any;
}

describe('assignation sans la migration', () => {
  it('reconnaît une colonne inconnue (code ou message PostgREST)', () => {
    expect(isMissingColumnError(missingColumn)).toBe(true);
    expect(
      isMissingColumnError({
        message:
          "Could not find the 'assigned_staff_id' column of 'support_tickets' in the schema cache",
      })
    ).toBe(true);
    expect(isMissingColumnError({ message: 'timeout' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it('l’assignation répond 503, pas 500', async () => {
    const ctx: any = {
      db: fakeDb(missingColumn),
      tenantId: TENANT,
      actor: { kind: 'staff', staffId: ME, userId: 'user-1' },
      logger: { error: vi.fn(), warn: vi.fn() },
    };
    await expect(
      setAssignment(ctx, 'demandes', ID, 'claim')
    ).rejects.toMatchObject({ status: 503 });
  });

  it('une liste se relit sans les colonnes d’assignation', async () => {
    const run = vi.fn(async (withAssignment: boolean) =>
      withAssignment
        ? { data: null, error: missingColumn }
        : { data: [{ id: 'x' }], error: null }
    );
    const out = await withAssignmentFallback(run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({
      data: [{ id: 'x' }],
      error: null,
      assignmentAvailable: false,
    });
  });

  it('migration appliquée : une seule lecture', async () => {
    const run = vi.fn(async () => ({ data: [], error: null }));
    const out = await withAssignmentFallback(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(out.assignmentAvailable).toBe(true);
  });
});
