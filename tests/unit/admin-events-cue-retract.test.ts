// tests/unit/admin-events-cue-retract.test.ts
//
// Tests for /api/admin/events/[runId]/cues/[cueId] (DELETE — retract a cue).
// Feature: Run-of-show — rétractation d'un cue (anti-erreur live).
//
// Sibling of tests/unit/admin-events-cues.test.ts (create/list). Reuses the same
// in-memory Supabase mock, the same staff-auth harness and the same req/res
// helpers.
//
// DELETE behaviour:
//   - 200 on retracting an active cue: retracted_at stamped now(),
//     retracted_by_user_id = ctx.user.id, logStaffAction called.
//   - 200 idempotent when the cue is already retracted (alreadyRetracted:true),
//     no second UPDATE, no new logStaffAction.
//   - 404 when the cue is unknown or belongs to another tenant.
//   - 400 when runId or cueId is not a valid UUID.
//   - 405 on GET/POST/PUT with Allow: DELETE.
//   - 403 when staff role < manager (caster).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { logStaffActionMock } = vi.hoisted(() => ({
  // Param typé (unknown) pour que mock.calls[0][0] soit indexable côté tsc :
  // sans param, vi.fn infère un tuple d'args vide et l'assertion sur l'entité
  // loggée ne compilerait pas (next build typecheck aussi les tests).
  logStaffActionMock: vi.fn(async (_payload?: unknown) => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import { store, resetSupabaseMock, setAuthUser } from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import cueRetractHandler from '../../pages/api/admin/events/[runId]/cues/[cueId]';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';
const RUN_LIVE = '11111111-1111-4111-8111-111111111111';
const CUE_ACTIVE = '22222222-2222-4222-8222-22222222aaaa';
const CUE_RETRACTED = '22222222-2222-4222-8222-22222222bbbb';
const CUE_OTHER_TENANT = '22222222-2222-4222-8222-22222222cccc';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: 'staff-mgr-1',
    auth_user_id: 'user-1',
    email: 'mgr@x.com',
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
    method: 'DELETE',
    headers: {
      host: 'h',
      authorization: `Bearer ${freshToken()}`,
    },
    query: { runId: RUN_LIVE, cueId: CUE_ACTIVE },
    body: {},
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
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedCues() {
  store.event_runs = [
    {
      id: RUN_LIVE,
      tenant_id: TENANT_X,
      status: 'live',
      name: 'Show',
      slug: 'show',
    },
  ] as any;

  store.event_cues = [
    {
      id: CUE_ACTIVE,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      severity: 'urgent',
      body: 'Coupez la régie',
      created_by_user_id: 'user-1',
      created_at: '2026-05-21T20:00:00.000Z',
      expires_at: null,
      dedup_key: null,
      retracted_at: null,
      retracted_by_user_id: null,
    },
    {
      id: CUE_RETRACTED,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      severity: 'warn',
      body: 'Déjà annulé',
      created_by_user_id: 'user-1',
      created_at: '2026-05-21T20:01:00.000Z',
      expires_at: null,
      dedup_key: null,
      retracted_at: '2026-05-21T20:05:00.000Z',
      retracted_by_user_id: 'user-9',
    },
    {
      id: CUE_OTHER_TENANT,
      tenant_id: TENANT_Y,
      event_run_id: RUN_LIVE,
      severity: 'info',
      body: 'Autre tenant',
      created_by_user_id: 'user-2',
      created_at: '2026-05-21T20:02:00.000Z',
      expires_at: null,
      dedup_key: null,
      retracted_at: null,
      retracted_by_user_id: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  logStaffActionMock.mockClear();
});

/* ===========================================================
 * DELETE /api/admin/events/[runId]/cues/[cueId]
 * =========================================================*/

describe('DELETE /api/admin/events/[runId]/cues/[cueId]', () => {
  it('200 retracting an active cue: stamps retracted_at + retracted_by_user_id, logs the action', async () => {
    seedCues();

    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, cueId: CUE_ACTIVE } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      cue: { id: string; retracted_at: string | null; retracted_by_user_id: string | null };
      alreadyRetracted?: boolean;
    };
    expect(body.alreadyRetracted).toBeUndefined();
    expect(body.cue.id).toBe(CUE_ACTIVE);
    expect(body.cue.retracted_at).toBeTruthy();
    expect(body.cue.retracted_by_user_id).toBe('user-1');

    // Persisted row is mutated in place.
    const persisted = (store.event_cues as any[]).find((c) => c.id === CUE_ACTIVE);
    expect(persisted.retracted_at).toBeTruthy();
    expect(persisted.retracted_by_user_id).toBe('user-1');

    // logStaffAction called once with the right entity.
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const logArg = logStaffActionMock.mock.calls[0][0] as any;
    expect(logArg.action).toBe('other');
    expect(logArg.entity_type).toBe('event_cue');
    expect(logArg.entity_id).toBe(CUE_ACTIVE);
    expect(logArg.tenant_id).toBe(TENANT_X);
  });

  it('200 idempotent when the cue is already retracted: alreadyRetracted=true, no second update, no log', async () => {
    seedCues();
    const before = (store.event_cues as any[]).find((c) => c.id === CUE_RETRACTED);
    const originalRetractedAt = before.retracted_at;
    const originalRetractedBy = before.retracted_by_user_id;

    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, cueId: CUE_RETRACTED } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      cue: { id: string; retracted_at: string | null; retracted_by_user_id: string | null };
      alreadyRetracted?: boolean;
    };
    expect(body.alreadyRetracted).toBe(true);
    expect(body.cue.id).toBe(CUE_RETRACTED);

    // No second UPDATE: the stamp is unchanged (not overwritten with now()/user-1).
    const after = (store.event_cues as any[]).find((c) => c.id === CUE_RETRACTED);
    expect(after.retracted_at).toBe(originalRetractedAt);
    expect(after.retracted_by_user_id).toBe(originalRetractedBy);

    // No staff action logged for a no-op.
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('404 when the cue does not exist', async () => {
    seedCues();
    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({
        query: { runId: RUN_LIVE, cueId: '99999999-9999-4999-8999-999999999999' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('404 when the cue belongs to another tenant (cross-tenant leak protection)', async () => {
    seedCues();
    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, cueId: CUE_OTHER_TENANT } }),
      res
    );
    expect(res.statusCode).toBe(404);

    // The other-tenant cue is untouched.
    const untouched = (store.event_cues as any[]).find((c) => c.id === CUE_OTHER_TENANT);
    expect(untouched.retracted_at).toBeNull();
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('400 when runId is not a valid UUID', async () => {
    seedCues();
    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({ query: { runId: 'not-a-uuid', cueId: CUE_ACTIVE } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error?: string }).error).toBe('Invalid runId.');
  });

  it('400 when cueId is not a valid UUID', async () => {
    seedCues();
    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, cueId: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error?: string }).error).toBe('Invalid cueId.');
  });

  it('405 on GET with Allow: DELETE', async () => {
    seedCues();
    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({
        method: 'GET',
        query: { runId: RUN_LIVE, cueId: CUE_ACTIVE },
      }),
      res
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('DELETE');
  });

  it('403 when staff role is caster (below manager)', async () => {
    seedCues();
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();

    const res = makeRes();
    await cueRetractHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, cueId: CUE_ACTIVE } }),
      res
    );
    expect(res.statusCode).toBe(403);

    // The cue is left untouched when access is denied.
    const untouched = (store.event_cues as any[]).find((c) => c.id === CUE_ACTIVE);
    expect(untouched.retracted_at).toBeNull();
  });
});
