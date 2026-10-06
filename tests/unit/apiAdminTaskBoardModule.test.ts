// tests/unit/apiAdminTaskBoardModule.test.ts
//
// Kanban interne — contrat HTTP des routes admin migrées sur le module
// features/admin/tasks (defineAdminRoute). Complète apiAdminTaskBoard.test.ts
// sur ce qu'il ne couvrait pas : DELETE board (journal), message 400 d'un id
// invalide, 405 + Allow, et le corps 409 `wip_exceeded` exact que le client
// lit pour annuler le glisser-déposer.

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

import boardIdHandler from '../../pages/api/admin/tasks/boards/[id]';
import moveHandler from '../../pages/api/admin/tasks/tasks/[id]/move';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-adm-module';
const BOARD = '33333333-3333-4333-8333-333333333333';
const COL1 = '44444444-4444-4444-8444-444444444401';
const COL2 = '44444444-4444-4444-8444-444444444402';
const TASK = '55555555-5555-4555-8555-555555555501';
const TASK_FULL = '55555555-5555-4555-8555-555555555502';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-adm-module' },
    cookies: { staff_active_tenant_id: TENANT },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.2' },
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

function task(id: string, columnId: string, position: number) {
  return {
    id,
    tenant_id: TENANT,
    board_id: BOARD,
    column_id: columnId,
    title: `Carte ${id.slice(-2)}`,
    description: null,
    priority: 'medium',
    assignee_staff_id: null,
    due_date: null,
    position,
    labels: [],
    created_by: STAFF_ID,
    deleted_at: null,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: AUTH_USER_ID });
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: AUTH_USER_ID,
      email: 'adm@example.com',
      role: 'admin',
      display_name: 'Admin One',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    } as StaffMember,
  ] as any;
  store.tenants = [
    { id: TENANT, slug: 'conf', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
  store.task_boards = [
    {
      id: BOARD,
      tenant_id: TENANT,
      name: 'Association',
      description: null,
      position: 0,
      is_archived: false,
      created_by: STAFF_ID,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.task_columns = [
    {
      id: COL1,
      tenant_id: TENANT,
      board_id: BOARD,
      name: 'À faire',
      position: 0,
      wip_limit: null,
      is_done: false,
    },
    {
      id: COL2,
      tenant_id: TENANT,
      board_id: BOARD,
      name: 'En cours',
      position: 1,
      wip_limit: 1,
      is_done: false,
    },
  ] as any;
  store.tasks = [task(TASK, COL1, 0), task(TASK_FULL, COL2, 0)] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DELETE /api/admin/tasks/boards/[id]', () => {
  it('supprime le board et logue task_board_delete avec son nom', async () => {
    const res = makeRes();
    await boardIdHandler(
      makeReq({ method: 'DELETE', query: { id: BOARD } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(store.task_boards).toHaveLength(0);
    const log = (store.staff_logs ?? []).find(
      (l: any) => l.action === 'task_board_delete'
    ) as any;
    expect(log).toBeTruthy();
    expect(log.entity_type).toBe('task_board');
    expect(log.entity_id).toBe(BOARD);
    expect(log.tenant_id).toBe(TENANT);
    // defineAdminRoute ajoute `permission` (la garde qui a laissé passer).
    expect(log.payload).toEqual({
      name: 'Association',
      permission: 'manage_tasks',
    });
  });

  it('404 « Board introuvable » sur un board inconnu, sans journal', async () => {
    const res = makeRes();
    await boardIdHandler(
      makeReq({
        method: 'DELETE',
        query: { id: '33333333-3333-4333-8333-333333333399' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Board introuvable');
    expect(store.staff_logs ?? []).toHaveLength(0);
  });
});

describe('GET /api/admin/tasks/boards/[id] — archive des cartes terminées', () => {
  const DONE = '44444444-4444-4444-8444-444444444403';
  const OLD_DONE = '55555555-5555-4555-8555-555555555503';
  const RECENT_DONE = '55555555-5555-4555-8555-555555555504';
  const OLD_TODO = '55555555-5555-4555-8555-555555555505';
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();

  beforeEach(() => {
    (store.task_columns as any[]).push({
      id: DONE,
      tenant_id: TENANT,
      board_id: BOARD,
      name: 'Terminé',
      position: 2,
      wip_limit: null,
      is_done: true,
    });
    store.tasks = [
      { ...task(TASK, COL1, 0), updated_at: daysAgo(1) },
      // Ancienne mais NON terminée : toujours rendue.
      { ...task(OLD_TODO, COL1, 1), updated_at: daysAgo(90) },
      { ...task(OLD_DONE, DONE, 0), updated_at: daysAgo(45) },
      { ...task(RECENT_DONE, DONE, 1), updated_at: daysAgo(3) },
    ] as any;
  });

  const columnsOf = (res: any) =>
    new Map<string, any>(res.body.board.columns.map((c: any) => [c.id, c]));

  it('masque par défaut les cartes terminées depuis plus de 30 jours, et les compte', async () => {
    const res = makeRes();
    await boardIdHandler(makeReq({ query: { id: BOARD } }), res);
    expect(res.statusCode).toBe(200);
    const cols = columnsOf(res);
    expect(cols.get(DONE).tasks.map((t: any) => t.id)).toEqual([RECENT_DONE]);
    expect(cols.get(DONE).archivedCount).toBe(1);
    expect(cols.get(COL1).tasks.map((t: any) => t.id)).toEqual([
      TASK,
      OLD_TODO,
    ]);
    expect(cols.get(COL1).archivedCount).toBe(0);
  });

  it('`?archive=1` rend toute l’archive', async () => {
    const res = makeRes();
    await boardIdHandler(makeReq({ query: { id: BOARD, archive: '1' } }), res);
    expect(res.statusCode).toBe(200);
    const done = columnsOf(res).get(DONE);
    expect(done.tasks.map((t: any) => t.id)).toEqual([OLD_DONE, RECENT_DONE]);
    expect(done.archivedCount).toBe(0);
  });
});

describe('contrat HTTP conservé', () => {
  it('400 avec le message historique sur un id non-uuid', async () => {
    const res = makeRes();
    await boardIdHandler(makeReq({ query: { id: 'pas-un-uuid' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Board id invalide');
  });

  it('405 + Allow sur une méthode non déclarée', async () => {
    const res = makeRes();
    await moveHandler(makeReq({ method: 'POST', query: { id: TASK } }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('PATCH');
  });

  it('409 wip_exceeded : code métier, limit et current intacts', async () => {
    const res = makeRes();
    await moveHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TASK },
        body: { columnId: COL2 },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'wip_exceeded',
      limit: 1,
      current: 1,
    });
    expect(typeof res.body.error).toBe('string');
    expect(typeof res.body.requestId).toBe('string');
    // Rien n'a bougé.
    expect((store.tasks.find((t: any) => t.id === TASK) as any).column_id).toBe(
      COL1
    );
  });
});
