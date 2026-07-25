// tests/unit/cronTaskDueReminders.test.ts
//
// Cron rappel J-1 des cartes Kanban. Target :
// pages/api/cron/task-due-reminders.ts (runTaskDueReminders).
// Vérifie : sélection des cartes dues demain non terminées + émission
// task.due_soon (payload), exclusion des cartes en colonne is_done, des cartes
// supprimées et de celles dues à une autre date.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { runTaskDueReminders } from '../../pages/api/cron/task-due-reminders';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const BOARD = '33333333-3333-4333-8333-333333333333';
const COL_TODO = '44444444-4444-4444-8444-444444444401';
const COL_DONE = '44444444-4444-4444-8444-444444444402';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = 'user-adm-1';

// System time fixe → demain (UTC) = 2026-08-02.
const TOMORROW = '2026-08-02';

function task(over: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    tenant_id: TENANT,
    board_id: BOARD,
    column_id: COL_TODO,
    title: 'Réserver la salle',
    description: null,
    priority: 'high',
    assignee_staff_id: null,
    due_date: TOMORROW,
    position: 0,
    labels: [],
    created_by: STAFF_ID,
    deleted_at: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z')); // demain = 2026-08-02
  store.task_boards = [
    { id: BOARD, tenant_id: TENANT, name: 'Association' },
  ] as any;
  store.task_columns = [
    {
      id: COL_TODO,
      tenant_id: TENANT,
      board_id: BOARD,
      name: 'À faire',
      is_done: false,
    },
    {
      id: COL_DONE,
      tenant_id: TENANT,
      board_id: BOARD,
      name: 'Terminé',
      is_done: true,
    },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runTaskDueReminders', () => {
  it('émet task.due_soon pour une carte due demain non terminée', async () => {
    store.tasks = [task()] as any;

    const c = await runTaskDueReminders();
    expect(c.processed).toBe(1);
    expect(c.emitted).toBe(1);

    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.due_soon'
    );
    expect(evt).toBeTruthy();
    const data = (evt as any).payload.data;
    expect(data.taskId).toBe('task-1');
    expect(data.boardName).toBe('Association');
    expect(data.columnName).toBe('À faire');
    expect(data.dueDate).toBe(TOMORROW);
    expect(data.priority).toBe('high');
    expect((evt as any).tenant_id).toBe(TENANT);
  });

  it('résout l’assigné (name + discord) dans le payload', async () => {
    store.tasks = [task({ assignee_staff_id: STAFF_ID })] as any;
    store.staff = [
      { id: STAFF_ID, display_name: 'Admin One', auth_user_id: AUTH_USER_ID },
    ] as any;
    store.user_discord_links = [
      { auth_user_id: AUTH_USER_ID, discord_user_id: '123456789012345678' },
    ] as any;

    const c = await runTaskDueReminders();
    expect(c.emitted).toBe(1);
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.due_soon'
    );
    const data = (evt as any).payload.data;
    expect(data.assigneeStaffId).toBe(STAFF_ID);
    expect(data.assigneeName).toBe('Admin One');
    expect(data.assigneeDiscordUserId).toBe('123456789012345678');
  });

  it('ignore une carte en colonne terminale (is_done)', async () => {
    store.tasks = [task({ column_id: COL_DONE })] as any;
    const c = await runTaskDueReminders();
    expect(c.processed).toBe(0);
    expect(c.emitted).toBe(0);
    expect(store.bot_event_outbox ?? []).toHaveLength(0);
  });

  it('ignore une carte supprimée (deleted_at)', async () => {
    store.tasks = [task({ deleted_at: '2026-07-30T00:00:00.000Z' })] as any;
    const c = await runTaskDueReminders();
    expect(c.processed).toBe(0);
    expect(c.emitted).toBe(0);
  });

  it('ignore une carte due à une autre date (pas J-1)', async () => {
    store.tasks = [
      task({ id: 'today', due_date: '2026-08-01' }),
      task({ id: 'later', due_date: '2026-08-05' }),
    ] as any;
    const c = await runTaskDueReminders();
    expect(c.processed).toBe(0);
    expect(c.emitted).toBe(0);
  });
});
