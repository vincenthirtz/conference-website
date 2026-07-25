// tests/unit/cronTaskBoardDigest.test.ts
//
// Cron digest quotidien des boards Kanban. Target :
// pages/api/cron/task-board-digest.ts (runTaskBoardDigest).
// Vérifie : agrégation par colonne, overdue/dueToday (colonne non terminale),
// exclusion des cartes supprimées et des boards archivés, émission d'UN
// task.digest par tenant.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { runTaskBoardDigest } from '../../pages/api/cron/task-board-digest';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const BOARD = '33333333-3333-4333-8333-333333333333';
const COL_TODO = '44444444-4444-4444-8444-444444444401';
const COL_DONE = '44444444-4444-4444-8444-444444444402';

// System time fixe → aujourd'hui (UTC) = 2026-08-01.
const TODAY = '2026-08-01';
const YESTERDAY = '2026-07-31';

function task(over: Record<string, unknown> = {}) {
  return {
    id: 'task-x',
    tenant_id: TENANT,
    board_id: BOARD,
    column_id: COL_TODO,
    due_date: null,
    deleted_at: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  store.task_boards = [
    { id: BOARD, tenant_id: TENANT, name: 'Association', is_archived: false },
  ] as any;
  store.task_columns = [
    {
      id: COL_TODO,
      tenant_id: TENANT,
      board_id: BOARD,
      name: 'À faire',
      position: 0,
      is_done: false,
    },
    {
      id: COL_DONE,
      tenant_id: TENANT,
      board_id: BOARD,
      name: 'Terminé',
      position: 1,
      is_done: true,
    },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runTaskBoardDigest', () => {
  it('agrège counts par colonne, overdue et dueToday et émet task.digest', async () => {
    store.tasks = [
      task({ id: 'a', column_id: COL_TODO, due_date: YESTERDAY }), // overdue
      task({ id: 'b', column_id: COL_TODO, due_date: TODAY }), // dueToday
      task({ id: 'c', column_id: COL_TODO, due_date: null }), // ni l'un ni l'autre
      task({ id: 'd', column_id: COL_DONE, due_date: YESTERDAY }), // terminé → ignoré overdue
    ] as any;

    const c = await runTaskBoardDigest();
    expect(c.boards).toBe(1);
    expect(c.emitted).toBe(1);

    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.digest'
    );
    expect(evt).toBeTruthy();
    expect((evt as any).tenant_id).toBe(TENANT);
    const boards = (evt as any).payload.data.boards;
    expect(boards).toHaveLength(1);
    const b = boards[0];
    expect(b.boardId).toBe(BOARD);
    expect(b.total).toBe(4);
    expect(b.overdue).toBe(1);
    expect(b.dueToday).toBe(1);
    const todo = b.columns.find((x: any) => x.name === 'À faire');
    const done = b.columns.find((x: any) => x.name === 'Terminé');
    expect(todo.count).toBe(3);
    expect(done.count).toBe(1);
  });

  it('exclut les cartes supprimées du total et des compteurs', async () => {
    store.tasks = [
      task({ id: 'a', due_date: YESTERDAY }),
      task({
        id: 'gone',
        due_date: YESTERDAY,
        deleted_at: '2026-07-20T00:00:00.000Z',
      }),
    ] as any;
    const c = await runTaskBoardDigest();
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.digest'
    );
    const b = (evt as any).payload.data.boards[0];
    expect(b.total).toBe(1);
    expect(b.overdue).toBe(1);
    expect(c.emitted).toBe(1);
  });

  it('ignore les boards archivés (aucun event si tout est archivé)', async () => {
    store.task_boards[0].is_archived = true;
    store.tasks = [task({ id: 'a', due_date: YESTERDAY })] as any;
    const c = await runTaskBoardDigest();
    expect(c.boards).toBe(0);
    expect(c.emitted).toBe(0);
    expect(store.bot_event_outbox ?? []).toHaveLength(0);
  });
});
