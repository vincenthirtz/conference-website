// tests/unit/apiAdminTaskTrash.test.ts
//
// Kanban interne — corbeille (endpoints admin, withStaffRoute('admin')).
// Couvre :
//   GET /api/admin/tasks/deleted → uniquement deleted_at IS NOT NULL, filtre
//     boardId, tri deleted_at DESC, noms board/colonne résolus.
//   PATCH /api/admin/tasks/tasks/[id]/restore → deleted_at = NULL + position
//     en fin de colonne, log task_restore, 404 inexistante, 409 not_deleted.
//   Gating rôle (caster → 403).

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

import deletedHandler from '../../pages/api/admin/tasks/deleted';
import restoreHandler from '../../pages/api/admin/tasks/tasks/[id]/restore';

const TENANT_A = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-adm-1';
const BOARD = '33333333-3333-4333-8333-333333333333';
const BOARD2 = '33333333-3333-4333-8333-333333333334';
const COL1 = '44444444-4444-4444-8444-444444444401';
const COL2 = '44444444-4444-4444-8444-444444444402';
const TASK_DEL1 = '55555555-5555-4555-8555-555555555501';
const TASK_DEL2 = '55555555-5555-4555-8555-555555555502';
const TASK_ACTIVE = '55555555-5555-4555-8555-555555555503';
const TASK_OTHER_BOARD = '55555555-5555-4555-8555-555555555504';

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: STAFF_ID,
    auth_user_id: AUTH_USER_ID,
    email: 'adm@example.com',
    role,
    display_name: 'Admin One',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: false,
  } as StaffMember;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-adm' },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
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

function seedStaff(role: 'owner' | 'admin' | 'caster' = 'admin') {
  store.staff = [makeStaffRow(role)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'conf', name: 'Conf', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'admin' },
  ] as any;
}

function taskRow(over: Partial<any>): any {
  return {
    id: 'x',
    tenant_id: TENANT_A,
    board_id: BOARD,
    column_id: COL1,
    title: 'Carte',
    description: null,
    priority: 'medium',
    assignee_staff_id: null,
    due_date: null,
    position: 0,
    labels: [],
    created_by: STAFF_ID,
    deleted_at: null,
    ...over,
  };
}

function seedBoard() {
  store.task_boards = [
    {
      id: BOARD,
      tenant_id: TENANT_A,
      name: 'Association',
      description: null,
      position: 0,
      is_archived: false,
      created_by: STAFF_ID,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: BOARD2,
      tenant_id: TENANT_A,
      name: 'Événement',
      description: null,
      position: 1,
      is_archived: false,
      created_by: STAFF_ID,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.task_columns = [
    {
      id: COL1,
      tenant_id: TENANT_A,
      board_id: BOARD,
      name: 'À faire',
      position: 0,
      wip_limit: null,
      is_done: false,
    },
    {
      id: COL2,
      tenant_id: TENANT_A,
      board_id: BOARD,
      name: 'Terminé',
      position: 1,
      wip_limit: null,
      is_done: true,
    },
  ] as any;
  store.tasks = [
    // Deux cartes supprimées sur BOARD/COL1 + une carte active COL1.
    taskRow({
      id: TASK_DEL1,
      title: 'Supprimée ancienne',
      column_id: COL1,
      deleted_at: '2026-07-01T10:00:00.000Z',
    }),
    taskRow({
      id: TASK_DEL2,
      title: 'Supprimée récente',
      column_id: COL1,
      due_date: '2026-08-01',
      priority: 'high',
      deleted_at: '2026-07-10T10:00:00.000Z',
    }),
    taskRow({
      id: TASK_ACTIVE,
      title: 'Active',
      column_id: COL1,
      position: 0,
      deleted_at: null,
    }),
    // Carte supprimée sur un AUTRE board (pour tester le filtre boardId).
    taskRow({
      id: TASK_OTHER_BOARD,
      title: 'Autre board',
      board_id: BOARD2,
      column_id: COL2,
      deleted_at: '2026-07-05T10:00:00.000Z',
    }),
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: AUTH_USER_ID });
  seedStaff('admin');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/admin/tasks/deleted', () => {
  beforeEach(seedBoard);

  it('ne renvoie que les cartes supprimées, triées deleted_at DESC, noms résolus', async () => {
    const res = makeRes();
    await deletedHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const tasks = (res.body as any).tasks;
    // 3 supprimées (2 sur BOARD, 1 sur BOARD2), la carte active exclue.
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t: any) => typeof t.deletedAt === 'string')).toBe(true);
    expect(tasks.some((t: any) => t.id === TASK_ACTIVE)).toBe(false);
    // Tri DESC : la plus récente d'abord (TASK_DEL2 @ 07-10).
    expect(tasks[0].id).toBe(TASK_DEL2);
    expect(tasks[0].boardName).toBe('Association');
    expect(tasks[0].columnName).toBe('À faire');
    expect(tasks[0].priority).toBe('high');
    expect(tasks[0].dueDate).toBe('2026-08-01');
  });

  it('filtre par boardId', async () => {
    const res = makeRes();
    await deletedHandler(
      makeReq({ method: 'GET', query: { boardId: BOARD } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const tasks = (res.body as any).tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t: any) => t.boardId === BOARD)).toBe(true);
  });

  it('400 sur boardId non-uuid', async () => {
    const res = makeRes();
    await deletedHandler(
      makeReq({ method: 'GET', query: { boardId: 'not-a-uuid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('caster → 403', async () => {
    seedStaff('caster');
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'caster' },
    ] as any;
    invalidateStaffCache();
    const res = makeRes();
    await deletedHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('non authentifié → 401', async () => {
    setAuthUser(null);
    invalidateStaffCache();
    const res = makeRes();
    await deletedHandler(
      makeReq({ method: 'GET', headers: { host: 'h' } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/admin/tasks/tasks/[id]/restore', () => {
  beforeEach(seedBoard);

  it('restaure la carte (deleted_at NULL) en fin de colonne et logue task_restore', async () => {
    const res = makeRes();
    await restoreHandler(
      makeReq({ method: 'PATCH', query: { id: TASK_DEL2 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const restored = store.tasks.find((t: any) => t.id === TASK_DEL2) as any;
    expect(restored.deleted_at).toBe(null);
    // COL1 avait 1 carte vivante (TASK_ACTIVE, position 0) → restaurée en 1.
    expect(restored.position).toBe(1);
    expect((res.body as any).task.columnId).toBe(COL1);
    expect((res.body as any).task.boardName).toBe('Association');
    const log = (store.staff_logs ?? []).find(
      (l: any) => l.action === 'task_restore'
    );
    expect(log).toBeTruthy();
    expect((log as any).entity_id).toBe(TASK_DEL2);
    expect((log as any).tenant_id).toBe(TENANT_A);
  });

  it('404 task_not_found sur une carte inexistante', async () => {
    const res = makeRes();
    await restoreHandler(
      makeReq({
        method: 'PATCH',
        query: { id: '55555555-5555-4555-8555-5555555555ff' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('task_not_found');
  });

  it('409 not_deleted sur une carte déjà active', async () => {
    const res = makeRes();
    await restoreHandler(
      makeReq({ method: 'PATCH', query: { id: TASK_ACTIVE } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('not_deleted');
    // La carte n'a pas été touchée.
    const active = store.tasks.find((t: any) => t.id === TASK_ACTIVE) as any;
    expect(active.deleted_at).toBe(null);
  });

  it('405 sur méthode non-PATCH', async () => {
    const res = makeRes();
    await restoreHandler(
      makeReq({ method: 'GET', query: { id: TASK_DEL1 } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('caster → 403', async () => {
    seedStaff('caster');
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'caster' },
    ] as any;
    invalidateStaffCache();
    const res = makeRes();
    await restoreHandler(
      makeReq({ method: 'PATCH', query: { id: TASK_DEL1 } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});
