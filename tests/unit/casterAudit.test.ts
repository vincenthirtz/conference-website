// tests/unit/casterAudit.test.ts
//
// POST /api/admin/caster/audit — journalise une action NOTABLE du cockpit
// caster web dans `staff_logs` (les écritures de scènes et le pilotage OBS se
// font depuis le navigateur, aucune route serveur ne peut les tracer).
//
// Couvre : 405 (+ Allow), 400 (action hors allowlist / body vide), succès
// (appel logStaffAction avec le bon staff/tenant/payload), et le fait qu'un
// échec du journal ne casse PAS l'action à l'antenne (200 quand même).
//
// Même socle que twitchEventSubSubscribe.test.ts (supabaseMock in-memory +
// logStaffAction mocké).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import auditHandler from '../../pages/api/admin/caster/audit';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'caster'
): StaffMember {
  return {
    id: 'staff-caster-1',
    auth_user_id: 'user-1',
    email: 'caster@x.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: { action: 'caster_stream_toggle' },
    cookies: {},
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('caster')] as any;
  logStaffActionMock.mockClear();
  logStaffActionMock.mockImplementation(async () => undefined);
});

describe('POST /api/admin/caster/audit', () => {
  it('refuse les méthodes autres que POST (405 + Allow)', async () => {
    const res = makeRes();
    await auditHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('rejette une action hors allowlist (400 INVALID_PAYLOAD)', async () => {
    const res = makeRes();
    await auditHandler(
      makeAuthedReq({ body: { action: 'delete_tournament' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('rejette un body sans action', async () => {
    const res = makeRes();
    await auditHandler(makeAuthedReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('journalise une action valide avec staff, tenant et contexte', async () => {
    const res = makeRes();
    await auditHandler(
      makeAuthedReq({
        body: {
          action: 'caster_match_import',
          entity_id: 'scene-42',
          details: { match: 'Chocolat vs Vanille', tournament: 'WC 2026' },
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    expect(logStaffActionMock).toHaveBeenCalledWith({
      staff_id: 'staff-caster-1',
      action: 'caster_match_import',
      entity_type: 'caster_cockpit',
      entity_id: 'scene-42',
      payload: { match: 'Chocolat vs Vanille', tournament: 'WC 2026' },
      tenant_id: TENANT_X,
    });
  });

  it('accepte une action sans entity_id ni details (null explicites)', async () => {
    const res = makeRes();
    await auditHandler(
      makeAuthedReq({ body: { action: 'caster_theme_activate' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: null, payload: null })
    );
  });

  it('un échec du journal ne casse pas l’action à l’antenne (200)', async () => {
    logStaffActionMock.mockImplementation(async () => {
      throw new Error('staff_logs unreachable');
    });
    const res = makeRes();
    await auditHandler(makeAuthedReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
