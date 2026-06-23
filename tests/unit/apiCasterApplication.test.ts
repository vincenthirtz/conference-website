import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import casterApplicationHandler from '../../pages/api/demandes/caster-application';
import adminDemandesHandler from '../../pages/api/admin/demandes/index';

const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const APPLICANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMANDE_ID = '22222222-2222-2222-2222-222222222222';

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: freshBearer() },
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
});

describe('POST /api/demandes/caster-application', () => {
  beforeEach(() => {
    setAuthUser({
      id: APPLICANT_ID,
      email: 'applicant@example.com',
      user_metadata: { display_name: 'Caster Hopeful' },
    });
  });

  it('201 happy path: inserts a pending caster_application demande', async () => {
    const res = makeRes();
    await casterApplicationHandler(
      makeReq({
        body: {
          motivation: 'I love casting Overwatch.',
          portfolioUrl: 'https://twitch.tv/applicant',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.application.status).toBe('pending');
    expect(typeof body.application.id).toBe('string');

    const row = (store.demandes as any[])[0];
    expect(row.type).toBe('caster_application');
    expect(row.status).toBe('pending');
    expect(row.user_id).toBe(APPLICANT_ID);
    expect(row.comment).toBe('I love casting Overwatch.');
    expect(row.payload.portfolio_url).toBe('https://twitch.tv/applicant');
    expect(row.payload.user_email).toBe('applicant@example.com');
    expect(row.payload.user_display_name).toBe('Caster Hopeful');
  });

  it('201 with no body fields: comment + portfolio_url null', async () => {
    const res = makeRes();
    await casterApplicationHandler(makeReq({ body: {} }), res);

    expect(res.statusCode).toBe(201);
    const row = (store.demandes as any[])[0];
    expect(row.comment).toBeNull();
    expect(row.payload.portfolio_url).toBeNull();
  });

  it('400 on invalid portfolio URL', async () => {
    const res = makeRes();
    await casterApplicationHandler(
      makeReq({ body: { portfolioUrl: 'not-a-url' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 ALREADY_STAFF when an active staff row exists', async () => {
    store.staff = [
      {
        id: 'staff-1',
        auth_user_id: APPLICANT_ID,
        email: 'applicant@example.com',
        role: 'caster',
        is_active: true,
      },
    ] as any;

    const res = makeRes();
    await casterApplicationHandler(makeReq({ body: {} }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('ALREADY_STAFF');
    expect(store.demandes ?? []).toHaveLength(0);
  });

  it('allows applying when the only staff row is inactive', async () => {
    store.staff = [
      {
        id: 'staff-1',
        auth_user_id: APPLICANT_ID,
        email: 'applicant@example.com',
        role: 'caster',
        is_active: false,
      },
    ] as any;

    const res = makeRes();
    await casterApplicationHandler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(201);
  });

  it('409 ALREADY_PENDING when a pending caster_application already exists', async () => {
    store.demandes = [
      {
        id: DEMANDE_ID,
        user_id: APPLICANT_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        type: 'caster_application',
        status: 'pending',
      },
    ] as any;

    const res = makeRes();
    await casterApplicationHandler(makeReq({ body: {} }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('ALREADY_PENDING');
    expect((res.body as any).existingDemandeId).toBe(DEMANDE_ID);
    // No duplicate inserted.
    expect((store.demandes as any[]).length).toBe(1);
  });

  it('GET returns the latest caster_application or null', async () => {
    let res = makeRes();
    await casterApplicationHandler(makeReq({ method: 'GET', body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).application).toBeNull();

    store.demandes = [
      {
        id: DEMANDE_ID,
        user_id: APPLICANT_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        type: 'caster_application',
        status: 'pending',
        comment: 'hi',
        created_at: '2026-01-01T00:00:00.000Z',
        processed_at: null,
      },
    ] as any;

    res = makeRes();
    await casterApplicationHandler(makeReq({ method: 'GET', body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).application.id).toBe(DEMANDE_ID);
  });

  it('405 on unsupported method', async () => {
    const res = makeRes();
    await casterApplicationHandler(makeReq({ method: 'PUT', body: {} }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET,POST');
  });

  it('401 when unauthenticated (no resolvable user)', async () => {
    setAuthUser(null);
    const res = makeRes();
    await casterApplicationHandler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('Admin approve caster_application side-effect', () => {
  function makeStaffActor() {
    setAuthUser({ id: 'admin-user' });
    store.staff = [
      {
        id: 'staff-admin',
        auth_user_id: 'admin-user',
        email: 'admin@example.com',
        role: 'admin',
        is_active: true,
      },
    ] as any;
  }

  function seedPendingApplication() {
    store.demandes = [
      {
        id: DEMANDE_ID,
        user_id: APPLICANT_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        type: 'caster_application',
        status: 'pending',
        comment: 'pick me',
        payload: {
          user_email: 'applicant@example.com',
          user_display_name: 'Caster Hopeful',
        },
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
  }

  it('approving inserts a staff row with role caster', async () => {
    makeStaffActor();
    seedPendingApplication();
    setAdminUser(APPLICANT_ID, 'applicant@example.com');

    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        body: {
          action: 'updateStatus',
          demandeIds: [DEMANDE_ID],
          newStatus: 'approved',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const promoted = (store.staff as any[]).find(
      (s) => s.auth_user_id === APPLICANT_ID
    );
    expect(promoted).toBeDefined();
    expect(promoted.role).toBe('caster');
    expect(promoted.is_active).toBe(true);
    expect(promoted.email).toBe('applicant@example.com');
  });

  it('does NOT downgrade an existing admin staff row', async () => {
    makeStaffActor();
    seedPendingApplication();
    setAdminUser(APPLICANT_ID, 'applicant@example.com');
    (store.staff as any[]).push({
      id: 'staff-applicant',
      auth_user_id: APPLICANT_ID,
      email: 'applicant@example.com',
      role: 'admin',
      is_active: true,
    });

    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        body: {
          action: 'updateStatus',
          demandeIds: [DEMANDE_ID],
          newStatus: 'approved',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const rows = (store.staff as any[]).filter(
      (s) => s.auth_user_id === APPLICANT_ID
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('admin'); // untouched, no downgrade
  });

  it('reactivates an inactive staff row without changing its role', async () => {
    makeStaffActor();
    seedPendingApplication();
    setAdminUser(APPLICANT_ID, 'applicant@example.com');
    (store.staff as any[]).push({
      id: 'staff-applicant',
      auth_user_id: APPLICANT_ID,
      email: 'applicant@example.com',
      role: 'manager',
      is_active: false,
    });

    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        body: {
          action: 'updateStatus',
          demandeIds: [DEMANDE_ID],
          newStatus: 'approved',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const rows = (store.staff as any[]).filter(
      (s) => s.auth_user_id === APPLICANT_ID
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('manager'); // untouched
    expect(rows[0].is_active).toBe(true); // reactivated
  });

  it('rejecting a caster_application does NOT promote', async () => {
    makeStaffActor();
    seedPendingApplication();
    setAdminUser(APPLICANT_ID, 'applicant@example.com');

    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        body: {
          action: 'updateStatus',
          demandeIds: [DEMANDE_ID],
          newStatus: 'rejected',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const promoted = (store.staff as any[]).find(
      (s) => s.auth_user_id === APPLICANT_ID
    );
    expect(promoted).toBeUndefined();
  });
});
