// tests/unit/apiAdminTaskBoard.test.ts
//
// Kanban interne — endpoints admin (withStaffRoute('admin')).
// Couvre : création board + colonnes par défaut, création carte (positionnement),
// déplacement (change column_id + émet task.moved), assignation (émet
// task.assigned), 409 colonne non vide, gating rôle (caster → 403).

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

import boardsHandler from '../../pages/api/admin/tasks/boards';
import boardIdHandler from '../../pages/api/admin/tasks/boards/[id]';
import columnsHandler from '../../pages/api/admin/tasks/columns';
import columnIdHandler from '../../pages/api/admin/tasks/columns/[id]';
import tasksHandler from '../../pages/api/admin/tasks/tasks';
import moveHandler from '../../pages/api/admin/tasks/tasks/[id]/move';
import assignHandler from '../../pages/api/admin/tasks/tasks/[id]/assign';

const TENANT_A = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-adm-1';
const BOARD = '33333333-3333-4333-8333-333333333333';
const COL1 = '44444444-4444-4444-8444-444444444401';
const COL2 = '44444444-4444-4444-8444-444444444402';
const TASK = '55555555-5555-4555-8555-555555555501';

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
    {
      id: TASK,
      tenant_id: TENANT_A,
      board_id: BOARD,
      column_id: COL1,
      title: 'Réserver la salle',
      description: null,
      priority: 'medium',
      assignee_staff_id: null,
      due_date: null,
      position: 0,
      labels: [],
      created_by: STAFF_ID,
      deleted_at: null,
    },
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

describe('POST /api/admin/tasks/boards', () => {
  it('crée un board + 4 colonnes par défaut et logue', async () => {
    const res = makeRes();
    await boardsHandler(
      makeReq({ method: 'POST', body: { name: 'Événement X' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const board = (res.body as any).board;
    expect(board.columns).toHaveLength(4);
    expect(board.columns[3].isDone).toBe(true);
    expect(store.task_boards).toHaveLength(1);
    expect(store.task_columns).toHaveLength(4);
    const log = (store.staff_logs ?? []).find(
      (l: any) => l.action === 'task_board_create'
    );
    expect(log).toBeTruthy();
    expect((log as any).tenant_id).toBe(TENANT_A);
  });

  it('400 quand name manquant', async () => {
    const res = makeRes();
    await boardsHandler(makeReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('caster → 403', async () => {
    seedStaff('caster');
    store.tenant_staff = [
      { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'caster' },
    ] as any;
    invalidateStaffCache();
    const res = makeRes();
    await boardsHandler(makeReq({ method: 'POST', body: { name: 'X' } }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/admin/tasks/boards + boards/[id]', () => {
  beforeEach(seedBoard);

  it('liste les boards avec colonnes + compte de cartes', async () => {
    const res = makeRes();
    await boardsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const boards = (res.body as any).boards;
    expect(boards).toHaveLength(1);
    const col1 = boards[0].columns.find((c: any) => c.id === COL1);
    expect(col1.cardCount).toBe(1);
  });

  it('board complet renvoie les cartes triées par colonne', async () => {
    const res = makeRes();
    await boardIdHandler(makeReq({ method: 'GET', query: { id: BOARD } }), res);
    expect(res.statusCode).toBe(200);
    const board = (res.body as any).board;
    const col1 = board.columns.find((c: any) => c.id === COL1);
    expect(col1.tasks).toHaveLength(1);
    expect(col1.tasks[0].title).toBe('Réserver la salle');
  });
});

describe('POST /api/admin/tasks/tasks', () => {
  beforeEach(seedBoard);

  it('crée une carte en position max+1 et émet task.created', async () => {
    const res = makeRes();
    await tasksHandler(
      makeReq({
        method: 'POST',
        body: { boardId: BOARD, columnId: COL1, title: 'Nouvelle tâche' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    // COL1 avait déjà 1 carte (position 0) → nouvelle carte en position 1.
    const created = store.tasks.find(
      (t: any) => t.title === 'Nouvelle tâche'
    ) as any;
    expect(created.position).toBe(1);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.created'
    );
    expect(evt).toBeTruthy();
  });

  it("400 si la colonne n'appartient pas au board", async () => {
    const res = makeRes();
    await tasksHandler(
      makeReq({
        method: 'POST',
        body: {
          boardId: BOARD,
          columnId: '44444444-4444-4444-8444-4444444404ff',
          title: 'x',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/admin/tasks/tasks/[id]/move', () => {
  beforeEach(seedBoard);

  it('déplace la carte vers une autre colonne + émet task.moved', async () => {
    const res = makeRes();
    await moveHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TASK },
        body: { columnId: COL2 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).task.columnId).toBe(COL2);
    const moved = store.tasks.find((t: any) => t.id === TASK) as any;
    expect(moved.column_id).toBe(COL2);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.moved'
    );
    expect(evt).toBeTruthy();
    expect((evt as any).payload.data.toColumnName).toBe('Terminé');
    expect((evt as any).payload.data.isDone).toBe(true);
  });

  it("404 sur une colonne cible d'un autre board (introuvable)", async () => {
    const res = makeRes();
    await moveHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TASK },
        body: { columnId: '44444444-4444-4444-8444-4444444409ff' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/admin/tasks/tasks/[id]/assign', () => {
  beforeEach(seedBoard);

  it('assigne à un staff + émet task.assigned', async () => {
    const res = makeRes();
    await assignHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TASK },
        body: { assigneeStaffId: STAFF_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).task.assigneeStaffId).toBe(STAFF_ID);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.assigned'
    );
    expect(evt).toBeTruthy();
    expect((evt as any).payload.data.assigneeName).toBe('Admin One');
  });

  it('désassigne (null) sans émettre task.assigned', async () => {
    store.tasks[0].assignee_staff_id = STAFF_ID;
    const res = makeRes();
    await assignHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TASK },
        body: { assigneeStaffId: null },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const assigned = store.tasks.find((t: any) => t.id === TASK) as any;
    expect(assigned.assignee_staff_id).toBe(null);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.assigned'
    );
    expect(evt).toBeUndefined();
  });
});

describe('DELETE /api/admin/tasks/columns/[id]', () => {
  beforeEach(seedBoard);

  it('409 column_not_empty quand des cartes vivantes y sont', async () => {
    const res = makeRes();
    await columnIdHandler(
      makeReq({ method: 'DELETE', query: { id: COL1 } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('column_not_empty');
  });

  it('supprime une colonne vide', async () => {
    const res = makeRes();
    await columnIdHandler(
      makeReq({ method: 'DELETE', query: { id: COL2 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.task_columns.find((c: any) => c.id === COL2)).toBeUndefined();
  });
});

describe('POST /api/admin/tasks/columns', () => {
  beforeEach(seedBoard);

  it('crée une colonne en position max+1', async () => {
    const res = makeRes();
    await columnsHandler(
      makeReq({ method: 'POST', body: { boardId: BOARD, name: 'En cours' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).column.position).toBe(2);
  });
});
