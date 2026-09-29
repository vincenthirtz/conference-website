// tests/unit/apiAdminDemandeNotifyCaptains.test.ts
//
// POST /api/admin/demandes/[id]/notify-captains — relance Discord des
// capitaines d'une demande de scrim.
//
// Ce que ces tests protègent : seule une demande de scrim EN ATTENTE, de
// l'espace du staff, et visant une équipe, déclenche l'envoi ; la réponse est
// un 202 (l'envoi passe par l'outbox du bot) et le geste est journalisé.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { notifyScrimRequestDm, logStaffAction } = vi.hoisted(() => ({
  notifyScrimRequestDm: vi.fn(async () => undefined),
  logStaffAction: vi.fn(async () => undefined),
}));
vi.mock('@/utils/scrimRequestNotify', () => ({
  notifyScrimRequestDm,
  formatScrimDateFr: () => 'mercredi 1er octobre',
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import handler from '../../pages/api/admin/demandes/[id]/notify-captains';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '5b0c1d2e-3f40-4a51-8b62-7c83d94ea5f6';
const TEAM = '21e7e75f-0a79-4036-bf1b-b730a0a26766';
const DEMANDE = '0f6d2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
const STAFF_ID = 'staff-1';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: { id: DEMANDE },
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

function demande(over: Record<string, unknown> = {}) {
  return {
    id: DEMANDE,
    tenant_id: TENANT,
    team_id: TEAM,
    type: 'scrim',
    status: 'pending',
    payload: { from_team_name: 'Beta', slots: [] },
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  notifyScrimRequestDm.mockClear();
  logStaffAction.mockClear();
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
    { id: TENANT, slug: 'conf', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
  store.demandes = [demande()] as any;
});

describe('POST /api/admin/demandes/[id]/notify-captains', () => {
  it('relance les capitaines et journalise le geste (202)', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ success: true });
    expect(notifyScrimRequestDm).toHaveBeenCalledTimes(1);
    expect(notifyScrimRequestDm).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        targetTeamId: TEAM,
        demandeId: DEMANDE,
        opponentName: 'Beta',
      })
    );
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: STAFF_ID,
        action: 'notify_scrim_captains',
        entity_type: 'demande',
        entity_id: DEMANDE,
        tenant_id: TENANT,
      })
    );
  });

  it('refuse un id mal formé (400)', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('demandeId invalide.');
    expect(notifyScrimRequestDm).not.toHaveBeenCalled();
  });

  it('une demande d’un autre espace répond 404', async () => {
    store.demandes = [demande({ tenant_id: OTHER_TENANT })] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(404);
    expect(notifyScrimRequestDm).not.toHaveBeenCalled();
  });

  it('refuse une demande qui n’est pas un scrim, ou déjà traitée (400)', async () => {
    store.demandes = [demande({ type: 'join' })] as any;
    let res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(400);

    store.demandes = [demande({ status: 'approved' })] as any;
    res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(400);

    expect(notifyScrimRequestDm).not.toHaveBeenCalled();
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('refuse une demande sans équipe cible (400)', async () => {
    store.demandes = [demande({ team_id: null })] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Cette demande ne vise aucune équipe.');
  });

  it('405 + Allow sur une autre méthode', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });
});
