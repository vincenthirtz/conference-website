// tests/unit/apiQuota.test.ts
//
// Coverage for utils/billing/apiQuota — durable per-plan quota + rate-limit:
//   - unlimited plans (foundation/editor) short-circuit the DB entirely
//   - metered plan under limits → ok + remaining
//   - minute rate exceeded → blocked (scope minute)
//   - monthly quota exceeded → blocked (scope month, prioritised)
//   - RPC error → fail-open (never blocks on infra failure)

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  resetSupabaseMock,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';
import { consumeApiQuota, minuteKey, monthKey } from '../../utils/billing/apiQuota';
import type { TenantPlanState } from '../../utils/billing/planFeatures';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOW = new Date('2026-07-13T14:05:30.000Z');

function plan(p: TenantPlanState['plan']): TenantPlanState {
  return { plan: p, plan_status: 'active', plan_expires_at: null };
}

function seedCounts(minute: number, month: number) {
  setRpcResult('consume_api_usage', {
    data: [{ minute_count: minute, month_count: month }],
  });
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('window keys (UTC)', () => {
  it('minuteKey / monthKey format', () => {
    expect(minuteKey(NOW)).toBe('202607131405');
    expect(monthKey(NOW)).toBe('202607');
  });
});

describe('consumeApiQuota', () => {
  it('unlimited plan (foundation) never touches the DB', async () => {
    const res = await consumeApiQuota(TENANT, plan('foundation'), NOW);
    expect(res.ok).toBe(true);
    expect(rpcCalls).toHaveLength(0);
  });

  it('metered plan under limits → ok with remaining', async () => {
    seedCounts(1, 1);
    const res = await consumeApiQuota(TENANT, plan('circuit'), NOW);
    expect(res).toMatchObject({ ok: true });
    if (res.ok) {
      expect(res.minuteLimit).toBe(120);
      expect(res.minuteRemaining).toBe(119);
      expect(res.monthUsed).toBe(1);
    }
    expect(rpcCalls).toHaveLength(1);
    expect((rpcCalls[0].params as any).p_tenant_id).toBe(TENANT);
    expect((rpcCalls[0].params as any).p_minute_key).toBe('202607131405');
  });

  it('minute rate exceeded → blocked (scope minute)', async () => {
    seedCounts(121, 200);
    const res = await consumeApiQuota(TENANT, plan('circuit'), NOW);
    expect(res).toMatchObject({ ok: false, scope: 'minute', limit: 120 });
    if (!res.ok) expect(res.retryAfterSec).toBe(30); // 60 - 30s
  });

  it('monthly quota exceeded → blocked (scope month, prioritised over minute)', async () => {
    seedCounts(121, 500_001);
    const res = await consumeApiQuota(TENANT, plan('circuit'), NOW);
    expect(res).toMatchObject({ ok: false, scope: 'month', limit: 500_000 });
  });

  it('RPC error → fail-open (does not block)', async () => {
    setRpcResult('consume_api_usage', { error: { message: 'db down' } });
    const res = await consumeApiQuota(TENANT, plan('circuit'), NOW);
    expect(res.ok).toBe(true);
  });

  it('expired paid plan downgrades to discovery limits (0) → blocked', async () => {
    seedCounts(1, 1);
    const expired: TenantPlanState = {
      plan: 'circuit',
      plan_status: 'active',
      plan_expires_at: '2000-01-01T00:00:00.000Z',
    };
    const res = await consumeApiQuota(TENANT, expired, NOW);
    // effectivePlan → discovery (both limits 0) → month checked first → blocked.
    expect(res).toMatchObject({ ok: false, scope: 'month', limit: 0 });
  });
});
