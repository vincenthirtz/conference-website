// tests/unit/apiPlanGate.test.ts
//
// Unit tests for `utils/billing/apiPlanGate.ts` — the PLAN gate for the paid
// API-keys product (`tenant_api_tokens`). Verifies method→action mapping,
// action→capability mapping, and the read/write entitlement decision per plan
// (foundation / discovery / regie / circuit + expiry downgrade).

import { describe, it, expect } from 'vitest';
import {
  apiActionForMethod,
  requiredCapabilityFor,
  checkTenantApiPlan,
  checkApiTokenAccess,
} from '../../utils/billing/apiPlanGate';
import type { TenantPlanState } from '../../utils/billing/planFeatures';

const NOW = Date.parse('2026-07-09T00:00:00.000Z');

function plan(
  p: TenantPlanState['plan'],
  over: Partial<TenantPlanState> = {}
): TenantPlanState {
  return {
    plan: p,
    plan_status: over.plan_status ?? 'active',
    plan_expires_at: over.plan_expires_at ?? null,
  };
}

describe('apiActionForMethod', () => {
  it('maps safe methods to read', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get', 'head']) {
      expect(apiActionForMethod(m)).toBe('read');
    }
  });
  it('maps mutating methods (and unknown) to write', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post', undefined]) {
      expect(apiActionForMethod(m)).toBe('write');
    }
  });
});

describe('requiredCapabilityFor', () => {
  it('read → apiRead, write → apiWrite', () => {
    expect(requiredCapabilityFor('read')).toBe('apiRead');
    expect(requiredCapabilityFor('write')).toBe('apiWrite');
  });
});

describe('checkTenantApiPlan', () => {
  it('foundation: allows read and write (null denial)', () => {
    expect(checkTenantApiPlan(plan('foundation'), 'read', NOW)).toBeNull();
    expect(checkTenantApiPlan(plan('foundation'), 'write', NOW)).toBeNull();
  });

  it('discovery: denies read and write with plan_required + capability', () => {
    const r = checkTenantApiPlan(plan('discovery'), 'read', NOW);
    expect(r?.error).toBe('plan_required');
    expect(r?.requiredCapability).toBe('apiRead');
    expect(r?.message).toMatch(/Régie/);

    const w = checkTenantApiPlan(plan('discovery'), 'write', NOW);
    expect(w?.error).toBe('plan_required');
    expect(w?.requiredCapability).toBe('apiWrite');
    expect(w?.message).toMatch(/Circuit/);
  });

  it('regie: allows read, denies write', () => {
    expect(checkTenantApiPlan(plan('regie'), 'read', NOW)).toBeNull();
    const w = checkTenantApiPlan(plan('regie'), 'write', NOW);
    expect(w?.requiredCapability).toBe('apiWrite');
  });

  it('circuit: allows read and write', () => {
    expect(checkTenantApiPlan(plan('circuit'), 'read', NOW)).toBeNull();
    expect(checkTenantApiPlan(plan('circuit'), 'write', NOW)).toBeNull();
  });

  it('regie expired downgrades to discovery: denies read and write', () => {
    const expired = plan('regie', {
      plan_expires_at: '2000-01-01T00:00:00.000Z',
    });
    expect(checkTenantApiPlan(expired, 'read', NOW)?.error).toBe(
      'plan_required'
    );
    expect(checkTenantApiPlan(expired, 'write', NOW)?.error).toBe(
      'plan_required'
    );
  });

  it('regie past_due downgrades to discovery: denies read', () => {
    const pastDue = plan('regie', { plan_status: 'past_due' });
    expect(checkTenantApiPlan(pastDue, 'read', NOW)?.error).toBe(
      'plan_required'
    );
  });
});

describe('checkApiTokenAccess (comp partner exemption)', () => {
  it('comp=true bypasses the gate on discovery: read and write allowed', () => {
    const t = { comp: true, plan: plan('discovery') };
    expect(checkApiTokenAccess(t, 'read', NOW)).toBeNull();
    expect(checkApiTokenAccess(t, 'write', NOW)).toBeNull();
  });

  it('comp=true bypasses the gate on an expired paid plan', () => {
    const t = {
      comp: true,
      plan: plan('regie', { plan_expires_at: '2000-01-01T00:00:00.000Z' }),
    };
    expect(checkApiTokenAccess(t, 'read', NOW)).toBeNull();
    expect(checkApiTokenAccess(t, 'write', NOW)).toBeNull();
  });

  it('comp=false falls back to the normal plan check (discovery → 403)', () => {
    const t = { comp: false, plan: plan('discovery') };
    expect(checkApiTokenAccess(t, 'read', NOW)?.error).toBe('plan_required');
    expect(checkApiTokenAccess(t, 'write', NOW)?.error).toBe('plan_required');
  });

  it('comp=false on regie: read ok, write denied (unchanged base behavior)', () => {
    const t = { comp: false, plan: plan('regie') };
    expect(checkApiTokenAccess(t, 'read', NOW)).toBeNull();
    expect(checkApiTokenAccess(t, 'write', NOW)?.requiredCapability).toBe(
      'apiWrite'
    );
  });
});
