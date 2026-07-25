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
