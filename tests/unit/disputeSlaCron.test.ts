import { describe, it, expect, vi, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({
    delivered: true,
    status: 200,
    attempts: 1,
  })),
}));

import { emitBotEvent } from '@/utils/botEvents';
import { runDisputeSlaCheck } from '../../pages/api/cron/dispute-sla-check';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  resetSupabaseMock();
  (emitBotEvent as any).mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-25T12:00:00.000Z'));
  store.tenants = [
    { id: TENANT_A, dispute_sla_minutes: 60, is_active: true },
    { id: TENANT_B, dispute_sla_minutes: 60, is_active: true },
  ] as any;
});

describe('runDisputeSlaCheck', () => {
  it('emits dispute.sla_breached + stamps escalation_pinged_at for fresh breaches', async () => {
    store.matches = [
      {
        id: 'm-breached',
        tenant_id: TENANT_A,
        tournament_id: 'tour-A',
        status: 'disputed',
        team1_id: 'tA',
        team2_id: 'tB',
        dispute_reason: 'late',
        dispute_opened_at: '2026-05-25T09:00:00.000Z', // 180 min ago > SLA 60
        escalation_pinged_at: null,
      },
      {
        id: 'm-fresh',
        tenant_id: TENANT_A,
        tournament_id: 'tour-A',
        status: 'disputed',
        dispute_opened_at: '2026-05-25T11:50:00.000Z', // 10 min ago < SLA 60
        escalation_pinged_at: null,
      },
    ] as any;

    const counters = await runDisputeSlaCheck();

    expect(counters.tenants_scanned).toBe(2);
    expect(counters.breaches_found).toBe(1);
    expect(counters.events_emitted).toBe(1);

    expect((emitBotEvent as any).mock.calls).toHaveLength(1);
    const [eventName, payload, tenantId] = (emitBotEvent as any).mock.calls[0];
    expect(eventName).toBe('dispute.sla_breached');
    expect(payload.matchId).toBe('m-breached');
    expect(payload.ageMinutes).toBeGreaterThanOrEqual(60);
    expect(payload.slaMinutes).toBe(60);
    expect(tenantId).toBe(TENANT_A);

    const stamped = (store.matches as any[]).find(
      (m) => m.id === 'm-breached'
    );
    expect(stamped.escalation_pinged_at).toBe('2026-05-25T12:00:00.000Z');

    const untouched = (store.matches as any[]).find((m) => m.id === 'm-fresh');
    expect(untouched.escalation_pinged_at).toBeNull();
  });

  it('does not re-fire for an already-pinged breach', async () => {
    store.matches = [
      {
        id: 'm',
        tenant_id: TENANT_A,
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        escalation_pinged_at: '2026-05-25T11:30:00.000Z',
      },
    ] as any;

    const counters = await runDisputeSlaCheck();
    expect(counters.breaches_found).toBe(0);
    expect((emitBotEvent as any).mock.calls).toHaveLength(0);
  });

  it('scans each active tenant independently', async () => {
    store.matches = [
      {
        id: 'a',
        tenant_id: TENANT_A,
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        escalation_pinged_at: null,
      },
      {
        id: 'b',
        tenant_id: TENANT_B,
        status: 'disputed',
        dispute_opened_at: '2026-05-25T09:00:00.000Z',
        escalation_pinged_at: null,
      },
    ] as any;
    const counters = await runDisputeSlaCheck();
    expect(counters.events_emitted).toBe(2);
    const tenantIdsCalled = (emitBotEvent as any).mock.calls.map(
      (c: any[]) => c[2]
    );
    expect(tenantIdsCalled.sort()).toEqual([TENANT_A, TENANT_B].sort());
  });
});
