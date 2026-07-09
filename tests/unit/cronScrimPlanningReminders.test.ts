// Unit tests for the scrim-planning reminder cron.
// Target: pages/api/cron/scrim-planning-reminders.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

vi.mock('@/utils/scrimPlanningEvents', () => ({
  emitScrimPlanningEvent: vi.fn(async () => undefined),
}));

import { emitScrimPlanningEvent } from '@/utils/scrimPlanningEvents';
import {
  runScrimPlanningReminders,
  runScrimPlanningAutoClose,
} from '../../pages/api/cron/scrim-planning-reminders';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const T1 = 'team-1';
const T2 = 'team-2';

function planning(over: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    tenant_id: TENANT,
    team1_id: T1,
    team2_id: T2,
    title: 'A vs B',
    game: 'overwatch',
    status: 'open',
    horizon_start: '2026-08-02',
    horizon_days: 3,
    validated_slot: null,
    scrim_id: null,
    deleted_at: null,
    reminder_pinged_at: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  (emitScrimPlanningEvent as any).mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z')); // cutoff = 2026-08-03
  store.tenants = [{ id: TENANT, is_active: true }] as any;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runScrimPlanningReminders', () => {
  it('emits a reminder + stamps when a team has not painted', async () => {
    store.scrim_plannings = [planning()] as any;
    store.scrim_planning_availabilities = [
      { id: 'a1', planning_id: 'plan-1', party: 'team1', slots: ['x'] },
    ] as any; // team2 missing

    const c = await runScrimPlanningReminders();
    expect(c.reminders_emitted).toBe(1);
    expect(emitScrimPlanningEvent).toHaveBeenCalledWith(
      'scrim.planning.reminder',
      expect.objectContaining({ id: 'plan-1' }),
      TENANT,
      expect.objectContaining({ missingParties: ['team2'] })
    );
    expect(store.scrim_plannings[0].reminder_pinged_at).toBeTruthy();
  });

  it('does not emit when both teams painted, but still stamps', async () => {
    store.scrim_plannings = [planning()] as any;
    store.scrim_planning_availabilities = [
      { id: 'a1', planning_id: 'plan-1', party: 'team1', slots: ['x'] },
      { id: 'a2', planning_id: 'plan-1', party: 'team2', slots: ['y'] },
    ] as any;

    const c = await runScrimPlanningReminders();
    expect(c.reminders_emitted).toBe(0);
    expect(emitScrimPlanningEvent).not.toHaveBeenCalled();
    expect(store.scrim_plannings[0].reminder_pinged_at).toBeTruthy();
  });

  it('skips a planning already reminded (reminder_pinged_at set)', async () => {
    store.scrim_plannings = [
      planning({ reminder_pinged_at: '2026-07-31T00:00:00.000Z' }),
    ] as any;
    store.scrim_planning_availabilities = [];

    const c = await runScrimPlanningReminders();
    expect(c.plannings_scanned).toBe(0);
    expect(emitScrimPlanningEvent).not.toHaveBeenCalled();
  });

  it('skips a planning whose horizon is beyond the cutoff', async () => {
    store.scrim_plannings = [planning({ horizon_start: '2026-08-20' })] as any;
    store.scrim_planning_availabilities = [];

    const c = await runScrimPlanningReminders();
    expect(c.plannings_scanned).toBe(0);
    expect(emitScrimPlanningEvent).not.toHaveBeenCalled();
  });

  it('skips non-open / deleted plannings', async () => {
    store.scrim_plannings = [
      planning({ id: 'p-val', status: 'validated' }),
      planning({ id: 'p-del', deleted_at: '2026-07-30T00:00:00.000Z' }),
    ] as any;
    store.scrim_planning_availabilities = [];

    const c = await runScrimPlanningReminders();
    expect(c.plannings_scanned).toBe(0);
  });
});

describe('runScrimPlanningAutoClose', () => {
  it('closes an open planning whose horizon fully passed', async () => {
    // horizon_start 2026-07-20 + 3 j = fin 2026-07-23 <= today (2026-08-01).
    store.scrim_plannings = [
      planning({ horizon_start: '2026-07-20', horizon_days: 3 }),
    ] as any;
    const c = await runScrimPlanningAutoClose();
    expect(c.plannings_closed).toBe(1);
    expect(store.scrim_plannings[0].status).toBe('closed');
  });

  it('does not close a planning still within its horizon', async () => {
    // Commence dans le futur → filtre .lt(horizon_start, today) l'exclut.
    store.scrim_plannings = [
      planning({ horizon_start: '2026-08-05', horizon_days: 3 }),
    ] as any;
    const c = await runScrimPlanningAutoClose();
    expect(c.plannings_closed).toBe(0);
    expect(store.scrim_plannings[0].status).toBe('open');
  });

  it('does not close a planning whose horizon started but has not ended', async () => {
    // Commence hier, dure 10 j → fin 2026-08-10 > today. Pas expirée.
    store.scrim_plannings = [
      planning({ horizon_start: '2026-07-31', horizon_days: 10 }),
    ] as any;
    const c = await runScrimPlanningAutoClose();
    expect(c.plannings_closed).toBe(0);
    expect(store.scrim_plannings[0].status).toBe('open');
  });
});
