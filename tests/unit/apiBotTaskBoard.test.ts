// tests/unit/apiBotTaskBoard.test.ts
//
// Kanban interne — endpoints bot (withBotRoute + requireBotStaff).
// Couvre : gating staff (401 sans clé, 403 non-staff), création via bot,
// déplacement (event task.moved), assignation via assigneeDiscordUserId
// (résolution Discord → staff) + assignSelf, et rejet 400 d'un Discord non-staff.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import listHandler from '../../pages/api/bot/v1/tasks/index';
import boardsHandler from '../../pages/api/bot/v1/tasks/boards';
import columnsHandler from '../../pages/api/bot/v1/tasks/columns';
import snapshotHandler from '../../pages/api/bot/v1/tasks/board-snapshot';
import moveHandler from '../../pages/api/bot/v1/tasks/[id]/move';
import assignHandler from '../../pages/api/bot/v1/tasks/[id]/assign';

const T = CONFERENCE_TENANT_ID;
const STAFF_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const STAFF_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const AUTH_A = 'auth-a';
const AUTH_B = 'auth-b';
const DISCORD_A = '111111111111111111';
const DISCORD_B = '222222222222222222';
const DISCORD_NOBODY = '999999999999999999';
const BOARD = '33333333-3333-4333-8333-333333333333';
const COL1 = '44444444-4444-4444-8444-444444444401';
const COL2 = '44444444-4444-4444-8444-444444444402';
const TASK = '55555555-5555-4555-8555-555555555501';

function makeBotReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': T,
    },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function makeRes(): any {
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

function seedKanban() {
  store.staff = [
    {
      id: STAFF_A,
      auth_user_id: AUTH_A,
      role: 'admin',
      display_name: 'Bot Admin A',
    },
    {
      id: STAFF_B,
      auth_user_id: AUTH_B,
      role: 'admin',
      display_name: 'Bot Admin B',
    },
  ] as any;
  store.user_discord_links = [
    { discord_user_id: DISCORD_A, auth_user_id: AUTH_A },
    { discord_user_id: DISCORD_B, auth_user_id: AUTH_B },
  ] as any;
  store.task_boards = [
    {
      id: BOARD,
      tenant_id: T,
      name: 'Association',
      position: 0,
      is_archived: false,
    },
  ] as any;
  store.task_columns = [
    {
      id: COL1,
      tenant_id: T,
      board_id: BOARD,
      name: 'À faire',
      position: 0,
      is_done: false,
    },
    {
      id: COL2,
      tenant_id: T,
      board_id: BOARD,
      name: 'Terminé',
      position: 1,
      is_done: true,
    },
  ] as any;
  store.tasks = [
    {
      id: TASK,
      tenant_id: T,
      board_id: BOARD,
      column_id: COL1,
      title: 'Publier le règlement',
      description: null,
      priority: 'high',
      assignee_staff_id: null,
      due_date: null,
      position: 0,
      labels: [],
      deleted_at: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  seedKanban();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('bot /tasks gating', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await listHandler({ ...makeBotReq(), headers: { host: 'h' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it("403 quand le compte Discord n'est pas staff", async () => {
    const res = makeRes();
    await listHandler(
      makeBotReq({ query: { actorDiscordUserId: DISCORD_NOBODY } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('GET bot /tasks + autocomplete', () => {
  it('liste les cartes du board', async () => {
    const res = makeRes();
    await listHandler(
      makeBotReq({ query: { actorDiscordUserId: DISCORD_A, boardId: BOARD } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const tasks = (res.body as any).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].boardName).toBe('Association');
    expect(tasks[0].columnName).toBe('À faire');
  });

  it('assignee=me ne renvoie que mes cartes', async () => {
    store.tasks[0].assignee_staff_id = STAFF_A;
    const res = makeRes();
    await listHandler(
      makeBotReq({ query: { actorDiscordUserId: DISCORD_A, assignee: 'me' } }),
      res
    );
    expect((res.body as any).tasks).toHaveLength(1);

    const res2 = makeRes();
    await listHandler(
      makeBotReq({ query: { actorDiscordUserId: DISCORD_B, assignee: 'me' } }),
      res2
    );
    expect((res2.body as any).tasks).toHaveLength(0);
  });

  it('boards autocomplete renvoie id+name', async () => {
    const res = makeRes();
    await boardsHandler(
      makeBotReq({ query: { actorDiscordUserId: DISCORD_A } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).boards[0].name).toBe('Association');
  });

  it('columns autocomplete exige boardId', async () => {
    const res = makeRes();
    await columnsHandler(
      makeBotReq({ query: { actorDiscordUserId: DISCORD_A } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('columns autocomplete renvoie les colonnes du board', async () => {
    const res = makeRes();
    await columnsHandler(
      makeBotReq({ query: { actorDiscordUserId: DISCORD_A, boardId: BOARD } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).columns).toHaveLength(2);
  });
});

describe('GET bot /tasks/board-snapshot (vue live, sans acteur staff)', () => {
  it('renvoie colonnes ordonnées + cartes non-deleted + checklist counts', async () => {
    store.tasks[0].assignee_staff_id = STAFF_A;
    store.tasks[0].due_date = '2026-08-01';
    // Deux labels sur la carte : « Logistique » a une définition colorée sur le
    // board, « Urgent » n'en a pas (→ color null). L'ordre stocké est préservé.
    store.tasks[0].labels = ['Logistique', 'Urgent'];
    store.task_labels = [
      {
        id: 'lbl-1',
        tenant_id: T,
        board_id: BOARD,
        name: 'Logistique',
        color: '#e11d48',
        position: 0,
      },
    ] as any;
    store.task_checklist_items = [
      { id: 'ci-1', tenant_id: T, task_id: TASK, label: 'a', is_done: true, position: 0 },
      { id: 'ci-2', tenant_id: T, task_id: TASK, label: 'b', is_done: false, position: 1 },
      { id: 'ci-3', tenant_id: T, task_id: TASK, label: 'c', is_done: false, position: 2 },
    ] as any;
    // Carte soft-deleted : NE doit PAS apparaître dans le snapshot.
    store.tasks.push({
      id: '55555555-5555-4555-8555-5555555555de',
      tenant_id: T,
      board_id: BOARD,
      column_id: COL1,
      title: 'Supprimée',
      description: null,
      priority: 'low',
      assignee_staff_id: null,
      due_date: null,
      position: 5,
      labels: [],
      deleted_at: '2026-01-01T00:00:00.000Z',
    } as any);

    const res = makeRes();
    await snapshotHandler(makeBotReq({ query: { boardId: BOARD } }), res);
    expect(res.statusCode).toBe(200);
    const board = (res.body as any).board;
    expect(board.id).toBe(BOARD);
    expect(board.name).toBe('Association');
    // Colonnes triées par position.
    expect(board.columns.map((c: any) => c.name)).toEqual(['À faire', 'Terminé']);
    const col1 = board.columns[0];
    expect(col1.isDone).toBe(false);
    expect(col1.cards).toHaveLength(1);
    expect(col1.cards[0].title).toBe('Publier le règlement');
    expect(col1.cards[0].priority).toBe('high');
    expect(col1.cards[0].assigneeName).toBe('Bot Admin A');
    expect(col1.cards[0].dueDate).toBe('2026-08-01');
    expect(col1.cards[0].checklist).toEqual({ done: 1, total: 3 });
    // Labels enrichis : couleur depuis task_labels pour « Logistique », null
    // pour « Urgent » (pas de définition), ordre de la carte préservé.
    expect(col1.cards[0].labels).toEqual([
      { name: 'Logistique', color: '#e11d48' },
      { name: 'Urgent', color: null },
    ]);
    // Colonne terminale vide (la carte y est absente).
    expect(board.columns[1].isDone).toBe(true);
    expect(board.columns[1].cards).toHaveLength(0);
  });

  it('assigneeName null quand la carte n’est pas assignée + checklist 0/0', async () => {
    const res = makeRes();
    await snapshotHandler(makeBotReq({ query: { boardId: BOARD } }), res);
    expect(res.statusCode).toBe(200);
    const card = (res.body as any).board.columns[0].cards[0];
    expect(card.assigneeName).toBe(null);
    expect(card.checklist).toEqual({ done: 0, total: 0 });
    // Carte sans label (tasks.labels[] vide) → labels: [].
    expect(card.labels).toEqual([]);
  });

  it('200 avec la clé bot SANS acteur staff (lecture seule)', async () => {
    const res = makeRes();
    // Aucun actorDiscordUserId fourni — l'endpoint ne l'exige pas.
    await snapshotHandler(makeBotReq({ query: { boardId: BOARD } }), res);
    expect(res.statusCode).toBe(200);
  });

  it('401 sans clé bot', async () => {
    const res = makeRes();
    await snapshotHandler(
      { ...makeBotReq({ query: { boardId: BOARD } }), headers: { host: 'h' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 INVALID_QUERY sans boardId', async () => {
    const res = makeRes();
    await snapshotHandler(makeBotReq({ query: {} }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_QUERY');
  });

  it('404 board_not_found sur board inconnu', async () => {
    const res = makeRes();
    await snapshotHandler(
      makeBotReq({ query: { boardId: '33333333-3333-4333-8333-3333333333ff' } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('board_not_found');
  });
});

describe('POST bot /tasks', () => {
  it('crée une carte (actor = staff résolu) et émet task.created', async () => {
    const res = makeRes();
    await listHandler(
      makeBotReq(
        {
          body: {
            actorDiscordUserId: DISCORD_A,
            boardId: BOARD,
            columnId: COL1,
            title: 'Contacter le lieu',
          },
        },
        'POST'
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const created = store.tasks.find(
      (t: any) => t.title === 'Contacter le lieu'
    ) as any;
    expect(created).toBeTruthy();
    expect(created.created_by).toBe(STAFF_A);
    expect(created.position).toBe(1);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.created'
    );
    expect(evt).toBeTruthy();
  });
});

describe('PATCH bot /tasks/[id]/move', () => {
  it('déplace la carte + émet task.moved', async () => {
    const res = makeRes();
    await moveHandler(
      makeBotReq(
        {
          query: { id: TASK },
          body: { actorDiscordUserId: DISCORD_A, columnId: COL2 },
        },
        'PATCH'
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    const moved = store.tasks.find((t: any) => t.id === TASK) as any;
    expect(moved.column_id).toBe(COL2);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.moved'
    );
    expect(evt).toBeTruthy();
  });
});

describe('PATCH bot /tasks/[id]/assign', () => {
  it('assigne via assigneeDiscordUserId (Discord → staff)', async () => {
    const res = makeRes();
    await assignHandler(
      makeBotReq(
        {
          query: { id: TASK },
          body: {
            actorDiscordUserId: DISCORD_A,
            assigneeDiscordUserId: DISCORD_B,
          },
        },
        'PATCH'
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    const assigned = store.tasks.find((t: any) => t.id === TASK) as any;
    expect(assigned.assignee_staff_id).toBe(STAFF_B);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.assigned'
    );
    expect((evt as any).payload.data.assigneeStaffId).toBe(STAFF_B);
  });

  it("assignSelf assigne à l'acteur", async () => {
    const res = makeRes();
    await assignHandler(
      makeBotReq(
        {
          query: { id: TASK },
          body: { actorDiscordUserId: DISCORD_A, assignSelf: true },
        },
        'PATCH'
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    const assigned = store.tasks.find((t: any) => t.id === TASK) as any;
    expect(assigned.assignee_staff_id).toBe(STAFF_A);
  });

  it("400 quand assigneeDiscordUserId n'est pas staff", async () => {
    const res = makeRes();
    await assignHandler(
      makeBotReq(
        {
          query: { id: TASK },
          body: {
            actorDiscordUserId: DISCORD_A,
            assigneeDiscordUserId: DISCORD_NOBODY,
          },
        },
        'PATCH'
      ),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('assignee_not_staff');
  });
});
