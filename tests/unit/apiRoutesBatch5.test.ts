import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import demandesCancelHandler from '../../pages/api/demandes/cancel';
import adminDemandeIdHandler from '../../pages/api/admin/demandes/[id]';
import completionStatusHandler from '../../pages/api/admin/stages/[stageId]/completion-status';
import adminCommentsHandler from '../../pages/api/admin/comments/index';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'caster'
): StaffMember {
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

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = false): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
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

/* -----------------------------------------------------------
 * /api/demandes/cancel — user cancels their pending demande
 * ---------------------------------------------------------*/

describe('DELETE /api/demandes/cancel', () => {
  const demandeId = '550e8400-e29b-41d4-a716-446655440100';

  it('returns 405 on non-DELETE', async () => {
    const res = makeRes();
    await demandesCancelHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 without Bearer token', async () => {
    const res = makeRes();
    await demandesCancelHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when demandeId is missing or invalid', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await demandesCancelHandler(
      makeReq({ method: 'DELETE', body: { demandeId: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when demande does not exist', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [];
    const res = makeRes();
    await demandesCancelHandler(
      makeReq({ method: 'DELETE', body: { demandeId } }, true),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when demande does not belong to user', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      { id: demandeId, user_id: 'other-user', status: 'pending' },
    ] as any;
    const res = makeRes();
    await demandesCancelHandler(
      makeReq({ method: 'DELETE', body: { demandeId } }, true),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when demande status is not pending', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      { id: demandeId, user_id: 'user-1', status: 'accepted' },
    ] as any;
    const res = makeRes();
    await demandesCancelHandler(
      makeReq({ method: 'DELETE', body: { demandeId } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 marks demande as cancelled', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      { id: demandeId, user_id: 'user-1', status: 'pending' },
    ] as any;
    const res = makeRes();
    await demandesCancelHandler(
      makeReq({ method: 'DELETE', body: { demandeId } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.demandes[0] as any).status).toBe('cancelled');
  });
});

/* -----------------------------------------------------------
 * /api/admin/demandes/[id] — admin lookup
 * ---------------------------------------------------------*/

describe('GET /api/admin/demandes/[id]', () => {
  const demId = '550e8400-e29b-41d4-a716-446655440200';

  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('caster')] as any;
  });

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await adminDemandeIdHandler(
      makeReq({ method: 'POST', query: { id: demId } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when id is invalid', async () => {
    const res = makeRes();
    await adminDemandeIdHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when demande does not exist', async () => {
    store.demandes = [];
    const res = makeRes();
    await adminDemandeIdHandler(
      makeReq({ method: 'GET', query: { id: demId } }, true),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 returns the demande enriched with user + staff info', async () => {
    store.demandes = [
      {
        id: demId,
        user_id: 'user-x',
        team_id: null,
        tournament_id: null,
        type: 'join',
        status: 'pending',
        comment: null,
        staff_note: null,
        processed_by_staff_id: 'staff-2',
        processed_at: null,
        source: null,
        payload: null,
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: null,
      },
    ] as any;
    setAdminUser('user-x', 'someone@example.com');
    store.staff = [
      makeStaffRow('caster'),
      {
        id: 'staff-2',
        auth_user_id: 'sa2',
        email: 'b@b.com',
        role: 'manager',
        display_name: 'Mgr',
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await adminDemandeIdHandler(
      makeReq({ method: 'GET', query: { id: demId } }, true),
      res
    );

    expect(res.statusCode).toBe(200);
    const dem = (res.body as any).demande;
    expect(dem.user.email).toBe('someone@example.com');
    expect(dem.handled_by.id).toBe('staff-2');
  });

  it('200 even if user lookup fails (graceful degradation)', async () => {
    store.demandes = [
      {
        id: demId,
        user_id: 'user-y',
        type: 'join',
        status: 'pending',
        processed_by_staff_id: null,
      },
    ] as any;
    // No setAdminUser — getUserById returns null user. The endpoint must
    // still return 200 with no `user` field.
    const res = makeRes();
    await adminDemandeIdHandler(
      makeReq({ method: 'GET', query: { id: demId } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).demande.user).toBeUndefined();
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/completion-status
 * ---------------------------------------------------------*/

describe('GET /api/admin/stages/[stageId]/completion-status', () => {
  const stageId = '550e8400-e29b-41d4-a716-446655440300';

  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('caster')] as any;
  });

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await completionStatusHandler(
      makeReq({ method: 'POST', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when stageId is invalid', async () => {
    const res = makeRes();
    await completionStatusHandler(
      makeReq({ method: 'GET', query: { stageId: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when stage does not exist', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await completionStatusHandler(
      makeReq({ method: 'GET', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 reports incomplete when matches remain', async () => {
    store.tournament_stages = [
      {
        id: stageId,
        tournament_id: 'tour-1',
        name: 'Group A',
        stage_type: 'group',
        order_index: 0,
        settings: {},
      },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: stageId, status: 'finished' },
      { id: 'm2', stage_id: stageId, status: 'pending' },
    ] as any;

    const res = makeRes();
    await completionStatusHandler(
      makeReq({ method: 'GET', query: { stageId } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.totalMatches).toBe(2);
    expect(body.finishedMatches).toBe(1);
    expect(body.isComplete).toBe(false);
  });

  it('200 reports complete + nextStage when all finished', async () => {
    store.tournament_stages = [
      {
        id: stageId,
        tournament_id: 'tour-1',
        name: 'Group A',
        stage_type: 'group',
        order_index: 0,
        settings: {},
      },
      {
        id: 'next-stage',
        tournament_id: 'tour-1',
        name: 'Knockout',
        stage_type: 'bracket',
        order_index: 1,
      },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: stageId, status: 'finished' },
      { id: 'm2', stage_id: stageId, status: 'finished' },
    ] as any;

    const res = makeRes();
    await completionStatusHandler(
      makeReq({ method: 'GET', query: { stageId } }, true),
      res
    );
    const body = res.body as any;
    expect(body.isComplete).toBe(true);
    expect(body.nextStage.id).toBe('next-stage');
    expect(body.canAdvance).toBe(true);
  });

  it('200 reports advancementRules when settings has them', async () => {
    store.tournament_stages = [
      {
        id: stageId,
        tournament_id: 'tour-1',
        name: 'Group',
        stage_type: 'group',
        order_index: 0,
        settings: {
          advancement_rules: { advance_top: 4, target_stage_id: 'target' },
        },
      },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: stageId, status: 'finished' },
    ] as any;

    const res = makeRes();
    await completionStatusHandler(
      makeReq({ method: 'GET', query: { stageId } }, true),
      res
    );
    const body = res.body as any;
    expect(body.canAdvance).toBe(true);
    expect(body.advancementRules.target_stage_id).toBe('target');
  });
});

/* -----------------------------------------------------------
 * /api/admin/comments — list/update/delete
 * ---------------------------------------------------------*/

describe('/api/admin/comments', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('GET 200 lists comments', async () => {
    store.news_comments = [
      { id: 'c1', news_id: 'n1', author_name: 'A', content: 'hi', created_at: '2026-04-01' },
      { id: 'c2', news_id: 'n1', author_name: 'B', content: 'hello', created_at: '2026-04-02' },
    ] as any;
    const res = makeRes();
    await adminCommentsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).comments).toHaveLength(2);
    expect((res.body as any).total).toBe(2);
  });

  it('GET filters by newsId', async () => {
    store.news_comments = [
      { id: 'c1', news_id: 'n1', content: 'a', created_at: '2026' },
      { id: 'c2', news_id: 'n2', content: 'b', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminCommentsHandler(
      makeReq({ method: 'GET', query: { newsId: 'n2' } }, true),
      res
    );
    expect((res.body as any).comments.map((c: any) => c.id)).toEqual(['c2']);
  });

  it('PATCH 400 when id is missing', async () => {
    const res = makeRes();
    await adminCommentsHandler(
      makeReq({ method: 'PATCH', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when content is too short', async () => {
    const res = makeRes();
    await adminCommentsHandler(
      makeReq({ method: 'PATCH', body: { id: 'c1', content: 'ab' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates the content', async () => {
    store.news_comments = [
      { id: 'c1', news_id: 'n1', author_name: 'A', content: 'old', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminCommentsHandler(
      makeReq(
        {
          method: 'PATCH',
          body: { id: 'c1', content: 'new content' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.news_comments[0] as any).content).toBe('new content');
  });

  it('DELETE 400 when id is missing', async () => {
    const res = makeRes();
    await adminCommentsHandler(
      makeReq({ method: 'DELETE', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE 200 removes the row', async () => {
    store.news_comments = [
      { id: 'c1', news_id: 'n1', content: 'x', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminCommentsHandler(
      makeReq({ method: 'DELETE', body: { id: 'c1' } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).deleted).toBe(true);
    expect(store.news_comments.length).toBe(0);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await adminCommentsHandler(makeReq({ method: 'PUT' }, true), res);
    expect(res.statusCode).toBe(405);
  });
});
