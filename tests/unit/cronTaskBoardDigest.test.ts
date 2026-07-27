// tests/unit/cronTaskBoardDigest.test.ts
//
// Cron digest quotidien des boards Kanban. Target :
// pages/api/cron/task-board-digest.ts (runTaskBoardDigest).
// Vérifie : agrégation par colonne, overdue/dueToday (colonne non terminale),
// exclusion des cartes supprimées et des boards archivés, émission d'UN
// task.digest par tenant, et les listes NOMMÉES de cartes (overdueTasks /
// dueTodayTasks / topTasks) qui accompagnent les compteurs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  runTaskBoardDigest,
  DIGEST_TASKS_PER_LIST,
} from '../../pages/api/cron/task-board-digest';

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
    title: 'Carte sans titre explicite',
    priority: 'medium',
    assignee_staff_id: null,
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

  it('nomme les cartes en retard (les plus anciennes en tête) et celles du jour', async () => {
    store.staff = [
      { id: 'staff-1', display_name: 'Vincent', auth_user_id: null },
    ] as any;
    store.tasks = [
      task({
        id: 'late-recent',
        due_date: YESTERDAY,
        title: 'Relancer les capitaines',
        priority: 'high',
        assignee_staff_id: 'staff-1',
      }),
      task({
        id: 'late-old',
        due_date: '2026-07-01',
        title: 'Payer le serveur',
        priority: 'urgent',
      }),
      task({ id: 'today', due_date: TODAY, title: 'Brief casteuses' }),
      task({
        id: 'done',
        column_id: COL_DONE,
        due_date: YESTERDAY,
        title: 'Ne doit pas apparaitre',
      }),
    ] as any;

    await runTaskBoardDigest();
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.digest'
    );
    const b = (evt as any).payload.data.boards[0];

    // Retard : trié par échéance croissante → le plus vieux d'abord.
    expect(b.overdueTasks.items.map((t: any) => t.title)).toEqual([
      'Payer le serveur',
      'Relancer les capitaines',
    ]);
    expect(b.overdueTasks.omitted).toBe(0);
    expect(b.overdueTasks.items[1].assigneeName).toBe('Vincent');
    expect(b.overdueTasks.items[1].columnName).toBe('À faire');
    expect(b.overdueTasks.items[0].priority).toBe('urgent');

    expect(b.dueTodayTasks.items.map((t: any) => t.title)).toEqual([
      'Brief casteuses',
    ]);

    // Une carte en colonne terminale n'est jamais nommée.
    const allTitles = [
      ...b.overdueTasks.items,
      ...b.dueTodayTasks.items,
      ...b.topTasks.items,
    ].map((t: any) => t.title);
    expect(allTitles).not.toContain('Ne doit pas apparaitre');
  });

  it('plafonne chaque liste et annonce le reliquat via omitted', async () => {
    store.tasks = Array.from({ length: DIGEST_TASKS_PER_LIST + 3 }, (_, i) =>
      task({
        id: `late-${i}`,
        due_date: YESTERDAY,
        title: `Carte en retard ${i}`,
      })
    ) as any;

    await runTaskBoardDigest();
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.digest'
    );
    const b = (evt as any).payload.data.boards[0];
    expect(b.overdue).toBe(DIGEST_TASKS_PER_LIST + 3);
    expect(b.overdueTasks.items).toHaveLength(DIGEST_TASKS_PER_LIST);
    expect(b.overdueTasks.omitted).toBe(3);
  });

  it('topTasks : nomme les cartes prioritaires quand rien n\'est daté', async () => {
    store.tasks = [
      task({ id: 'low', title: 'Petit truc', priority: 'low' }),
      task({ id: 'urgent', title: 'Gros truc', priority: 'urgent' }),
      task({ id: 'medium', title: 'Truc moyen', priority: 'medium' }),
    ] as any;

    await runTaskBoardDigest();
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.digest'
    );
    const b = (evt as any).payload.data.boards[0];
    expect(b.overdueTasks.items).toHaveLength(0);
    expect(b.dueTodayTasks.items).toHaveLength(0);
    // Tri par priorité décroissante.
    expect(b.topTasks.items.map((t: any) => t.title)).toEqual([
      'Gros truc',
      'Truc moyen',
      'Petit truc',
    ]);
  });

  it('topTasks reste vide dès qu\'il y a du daté (les listes datées suffisent)', async () => {
    store.tasks = [
      task({ id: 'late', due_date: YESTERDAY, title: 'En retard' }),
      task({ id: 'other', title: 'Sans date', priority: 'urgent' }),
    ] as any;

    await runTaskBoardDigest();
    const evt = (store.bot_event_outbox ?? []).find(
      (e: any) => e.event_name === 'task.digest'
    );
    const b = (evt as any).payload.data.boards[0];
    expect(b.overdueTasks.items).toHaveLength(1);
    expect(b.topTasks.items).toHaveLength(0);
  });
});
