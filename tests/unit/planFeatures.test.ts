import { describe, expect, it } from 'vitest';
import {
  getPlanFeatures,
  isPlanEntitled,
  effectivePlan,
  tenantFeatures,
  tenantHasCapability,
  PLAN_LABELS,
  type TenantPlanState,
} from '../../utils/billing/planFeatures';

const NOW = Date.parse('2026-07-09T12:00:00Z');
const state = (over: Partial<TenantPlanState>): TenantPlanState => ({
  plan: 'discovery',
  plan_status: 'active',
  plan_expires_at: null,
  ...over,
});

describe('planFeatures — matrice', () => {
  it('discovery (gratuit) : ni API ni white-label ni multi-tenant ni bot', () => {
    const f = getPlanFeatures('discovery');
    expect(f.apiRead).toBe(false);
    expect(f.apiWrite).toBe(false);
    expect(f.whiteLabel).toBe(false);
    expect(f.multiTenant).toBe(false);
    expect(f.maxLeagues).toBe(0);
    // Le bot est réservé à la Coupe féminine + plans payants.
    expect(f.discordBot).toBe(false);
    expect(f.discordEventOps).toBe('none');
  });

  it('le bot (discordBot) : foundation + plans payants oui, discovery non', () => {
    expect(getPlanFeatures('foundation').discordBot).toBe(true);
    expect(getPlanFeatures('regie').discordBot).toBe(true);
    expect(getPlanFeatures('circuit').discordBot).toBe(true);
    expect(getPlanFeatures('discovery').discordBot).toBe(false);
  });

  it('regie : white-label + API lecture, mais pas écriture ni multi-tenant', () => {
    const f = getPlanFeatures('regie');
    expect(f.whiteLabel).toBe(true);
    expect(f.apiRead).toBe(true);
    expect(f.apiWrite).toBe(false);
    expect(f.multiTenant).toBe(false);
    expect(f.maxLeagues).toBe(1);
    expect(f.arbitration).toBe(true);
  });

  it('circuit : API écriture + multi-tenant + ligues illimitées', () => {
    const f = getPlanFeatures('circuit');
    expect(f.apiWrite).toBe(true);
    expect(f.multiTenant).toBe(true);
    expect(f.maxLeagues).toBe(Infinity);
    expect(f.priorityArbitration).toBe(true);
  });

  it('foundation : accès complet (mission)', () => {
    const f = getPlanFeatures('foundation');
    expect(f.whiteLabel && f.apiRead && f.apiWrite && f.multiTenant).toBe(true);
    expect(f.maxLeagues).toBe(Infinity);
  });

  it('plan inconnu → repli sur discovery', () => {
    // @ts-expect-error test de robustesse runtime
    expect(getPlanFeatures('bogus')).toEqual(getPlanFeatures('discovery'));
  });
});

describe('planFeatures — entitlement / expiration', () => {
  it('foundation et discovery sont toujours entitled', () => {
    expect(isPlanEntitled(state({ plan: 'foundation' }), NOW)).toBe(true);
    expect(isPlanEntitled(state({ plan: 'discovery' }), NOW)).toBe(true);
  });

  it('plan payant actif non expiré = entitled', () => {
    const t = state({
      plan: 'regie',
      plan_status: 'active',
      plan_expires_at: '2027-01-01T00:00:00Z',
    });
    expect(isPlanEntitled(t, NOW)).toBe(true);
    expect(effectivePlan(t, NOW)).toBe('regie');
  });

  it('plan payant expiré → downgrade discovery', () => {
    const t = state({
      plan: 'circuit',
      plan_status: 'active',
      plan_expires_at: '2026-06-01T00:00:00Z',
    });
    expect(isPlanEntitled(t, NOW)).toBe(false);
    expect(effectivePlan(t, NOW)).toBe('discovery');
    expect(tenantFeatures(t, NOW).apiWrite).toBe(false);
    expect(tenantFeatures(t, NOW).multiTenant).toBe(false);
  });

  it('plan payant past_due/canceled → downgrade discovery même sans expiration', () => {
    const pastDue = state({ plan: 'regie', plan_status: 'past_due' });
    expect(effectivePlan(pastDue, NOW)).toBe('discovery');
    const canceled = state({ plan: 'circuit', plan_status: 'canceled' });
    expect(tenantHasCapability(canceled, 'apiRead', NOW)).toBe(false);
  });

  it('foundation ne downgrade jamais (même past_due théorique)', () => {
    const t = state({ plan: 'foundation', plan_status: 'past_due' });
    expect(effectivePlan(t, NOW)).toBe('foundation');
    expect(tenantHasCapability(t, 'apiWrite', NOW)).toBe(true);
  });
});

describe('planFeatures — helpers', () => {
  it('tenantHasCapability lit le plan effectif', () => {
    const regie = state({
      plan: 'regie',
      plan_expires_at: '2027-01-01T00:00:00Z',
    });
    expect(tenantHasCapability(regie, 'apiRead', NOW)).toBe(true);
    expect(tenantHasCapability(regie, 'apiWrite', NOW)).toBe(false);
    expect(
      tenantHasCapability(state({ plan: 'discovery' }), 'apiRead', NOW)
    ).toBe(false);
  });

  it('libellés présents pour chaque plan', () => {
    expect(PLAN_LABELS.foundation).toBe('Fondation');
    expect(PLAN_LABELS.regie).toBe('Régie');
    expect(PLAN_LABELS.circuit).toBe('Circuit');
  });
});
