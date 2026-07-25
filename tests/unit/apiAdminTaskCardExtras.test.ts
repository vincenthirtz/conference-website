// tests/unit/apiAdminTaskCardExtras.test.ts
//
// Kanban interne — extras de carte (commentaires + checklist), endpoints admin
// (withStaffRoute('admin')).
// Couvre : création + liste de commentaires (+ log task_comment_create),
// suppression commentaire, checklist create + toggle isDone, enrichissement du
// détail board (checklist { done, total } + commentCount) et du détail carte
// (comments + checklist complets), gating rôle (caster → 403).

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
import taskIdHandler from '../../pages/api/admin/tasks/tasks/[id]';
import commentsHandler from '../../pages/api/admin/tasks/tasks/[id]/comments';
import commentIdHandler from '../../pages/api/admin/tasks/comments/[id]';
import checklistHandler from '../../pages/api/admin/tasks/tasks/[id]/checklist';
import checklistIdHandler from '../../pages/api/admin/tasks/checklist/[id]';

const TENANT_A = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-adm-1';
const BOARD = '33333333-3333-4333-8333-333333333333';
const COL1 = '44444444-4444-4444-8444-444444444401';
const COL2 = '44444444-4444-4444-8444-444444444402';
const TASK = '55555555-5555-4555-8555-555555555501';
const COMMENT = '66666666-6666-4666-8666-666666666601';
const ITEM = '77777777-7777-4777-8777-777777777701';

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
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role },
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
  seedBoard();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST + GET /api/admin/tasks/tasks/[id]/comments', () => {
  it('crée un commentaire (auteur = staff courant), logue, puis le liste', async () => {
    const resPost = makeRes();
    await commentsHandler(
      makeReq({
        method: 'POST',
        query: { id: TASK },
        body: { body: 'On a un devis' },
      }),
      resPost
    );
    expect(resPost.statusCode).toBe(201);
    const comment = (resPost.body as any).comment;
    expect(comment.body).toBe('On a un devis');
    expect(comment.authorStaffId).toBe(STAFF_ID);
    expect(comment.authorName).toBe('Admin One');
    expect(store.task_comments).toHaveLength(1);

    const log = (store.staff_logs ?? []).find(
      (l: any) => l.action === 'task_comment_create'
    );
    expect(log).toBeTruthy();
    expect((log as any).tenant_id).toBe(TENANT_A);

    const resGet = makeRes();
    await commentsHandler(
      makeReq({ method: 'GET', query: { id: TASK } }),
      resGet
    );
    expect(resGet.statusCode).toBe(200);
    const comments = (resGet.body as any).comments;
    expect(comments).toHaveLength(1);
    expect(comments[0].authorName).toBe('Admin One');
  });

  it('400 quand body vide', async () => {
    const res = makeRes();
    await commentsHandler(
      makeReq({ method: 'POST', query: { id: TASK }, body: { body: '' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 quand la carte n’existe pas', async () => {
    const res = makeRes();
    await commentsHandler(
      makeReq({
        method: 'POST',
        query: { id: '55555555-5555-4555-8555-5555555599ff' },
        body: { body: 'x' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('caster → 403', async () => {
    seedStaff('caster');
    invalidateStaffCache();
    const res = makeRes();
    await commentsHandler(
      makeReq({ method: 'POST', query: { id: TASK }, body: { body: 'x' } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /api/admin/tasks/comments/[id]', () => {
  it('supprime un commentaire et logue task_comment_delete', async () => {
    store.task_comments = [
      {
        id: COMMENT,
        tenant_id: TENANT_A,
        task_id: TASK,
        author_staff_id: STAFF_ID,
        body: 'à supprimer',
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await commentIdHandler(
      makeReq({ method: 'DELETE', query: { id: COMMENT } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
    expect(
      store.task_comments.find((c: any) => c.id === COMMENT)
    ).toBeUndefined();
    const log = (store.staff_logs ?? []).find(
      (l: any) => l.action === 'task_comment_delete'
    );
    expect(log).toBeTruthy();
  });

  it('404 quand le commentaire n’existe pas', async () => {
    store.task_comments = [] as any;
    const res = makeRes();
    await commentIdHandler(
      makeReq({ method: 'DELETE', query: { id: COMMENT } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('checklist — create + toggle', () => {
  it('crée un item en position max+1 (0 sur checklist vide)', async () => {
    const res = makeRes();
    await checklistHandler(
      makeReq({
        method: 'POST',
        query: { id: TASK },
        body: { label: 'Appeler le traiteur' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const item = (res.body as any).item;
    expect(item.position).toBe(0);
    expect(item.isDone).toBe(false);
    expect(store.task_checklist_items).toHaveLength(1);

    // Second item → position 1.
    const res2 = makeRes();
    await checklistHandler(
      makeReq({ method: 'POST', query: { id: TASK }, body: { label: 'B' } }),
      res2
    );
    expect((res2.body as any).item.position).toBe(1);
  });

  it('toggle isDone via PATCH', async () => {
    store.task_checklist_items = [
      {
        id: ITEM,
        tenant_id: TENANT_A,
        task_id: TASK,
        label: 'Appeler',
        is_done: false,
        position: 0,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await checklistIdHandler(
      makeReq({ method: 'PATCH', query: { id: ITEM }, body: { isDone: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).item.isDone).toBe(true);
    expect(store.task_checklist_items[0].is_done).toBe(true);
    // La checklist n'est PAS auditée.
    const log = (store.staff_logs ?? []).find((l: any) =>
      String(l.action).startsWith('task_checklist')
    );
    expect(log).toBeUndefined();
  });

  it('DELETE supprime un item', async () => {
    store.task_checklist_items = [
      {
        id: ITEM,
        tenant_id: TENANT_A,
        task_id: TASK,
        label: 'Appeler',
        is_done: false,
        position: 0,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await checklistIdHandler(
      makeReq({ method: 'DELETE', query: { id: ITEM } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.task_checklist_items).toHaveLength(0);
  });

  it('GET liste les items triés par position', async () => {
    store.task_checklist_items = [
      {
        id: '77777777-7777-4777-8777-777777777702',
        tenant_id: TENANT_A,
        task_id: TASK,
        label: 'B',
        is_done: false,
        position: 1,
        created_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: ITEM,
        tenant_id: TENANT_A,
        task_id: TASK,
        label: 'A',
        is_done: true,
        position: 0,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await checklistHandler(
      makeReq({ method: 'GET', query: { id: TASK } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items.map((i: any) => i.label)).toEqual(['A', 'B']);
  });
});

describe('enrichissement du détail (board + carte)', () => {
  beforeEach(() => {
    store.task_comments = [
      {
        id: COMMENT,
        tenant_id: TENANT_A,
        task_id: TASK,
        author_staff_id: STAFF_ID,
        body: 'premier',
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ] as any;
    store.task_checklist_items = [
      {
        id: ITEM,
        tenant_id: TENANT_A,
        task_id: TASK,
        label: 'A',
        is_done: true,
        position: 0,
        created_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: '77777777-7777-4777-8777-777777777703',
        tenant_id: TENANT_A,
        task_id: TASK,
        label: 'B',
        is_done: false,
        position: 1,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ] as any;
  });

  it('GET board expose checklist { done, total } + commentCount par carte', async () => {
    const res = makeRes();
    await boardIdHandler(makeReq({ method: 'GET', query: { id: BOARD } }), res);
    expect(res.statusCode).toBe(200);
    const board = (res.body as any).board;
    const col1 = board.columns.find((c: any) => c.id === COL1);
    const card = col1.tasks.find((t: any) => t.id === TASK);
    expect(card.checklist).toEqual({ done: 1, total: 2 });
    expect(card.commentCount).toBe(1);
  });

  it('GET carte inclut comments[] + checklist[] complets', async () => {
    const res = makeRes();
    await taskIdHandler(makeReq({ method: 'GET', query: { id: TASK } }), res);
    expect(res.statusCode).toBe(200);
    const task = (res.body as any).task;
    expect(task.comments).toHaveLength(1);
    expect(task.comments[0].body).toBe('premier');
    expect(task.checklist).toHaveLength(2);
    expect(task.checklist.map((i: any) => i.label)).toEqual(['A', 'B']);
  });
});
