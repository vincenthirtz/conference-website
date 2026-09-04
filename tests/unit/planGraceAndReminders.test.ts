// tests/unit/planGraceAndReminders.test.ts
//
// T10 — la fin d'un abonnement cesse d'être un mur.
//
// Avant : `isPlanEntitled` refusait tout statut différent de `active`, donc un
// plan qui passait `past_due` retombait IMMÉDIATEMENT sur `discovery` — sans
// bot Discord, du jour au lendemain, pour un retard de paiement d'une journée.
// Et la seule relance partait à J-14 : le jour de l'échéance et les jours
// suivants ne disaient rien, le client découvrait la rétrogradation en
// constatant que son bot ne répondait plus.
//
// Ce que ces tests tiennent :
//   - sept jours de grâce après l'échéance, et pas un de plus ;
//   - une annulation, elle, ne se rattrape pas : c'est une décision ;
//   - la séquence de relance envoie chaque étape une fois, dans l'ordre.

import { describe, it, expect } from 'vitest';
import {
  isPlanEntitled,
  isInPlanGrace,
  effectivePlan,
  PLAN_GRACE_DAYS,
  type TenantPlanState,
} from '../../utils/billing/planFeatures';

const DAY = 86_400_000;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const state = (over: Partial<TenantPlanState> = {}): TenantPlanState => ({
  plan: 'regie',
  plan_status: 'active',
  plan_expires_at: new Date(NOW + 30 * DAY).toISOString(),
  ...over,
});

describe('période de grâce', () => {
  it('un plan actif non expiré a ses droits', () => {
    expect(isPlanEntitled(state(), NOW)).toBe(true);
    expect(isInPlanGrace(state(), NOW)).toBe(false);
  });

  it('garde les droits pendant les sept jours qui suivent l’échéance', () => {
    const s = state({
      plan_status: 'past_due',
      plan_expires_at: new Date(NOW - 2 * DAY).toISOString(),
    });
    // Sept jours laissent le temps qu'un virement arrive et qu'un humain
    // réponde à un email.
    expect(isPlanEntitled(s, NOW)).toBe(true);
    expect(isInPlanGrace(s, NOW)).toBe(true);
    expect(effectivePlan(s, NOW)).toBe('regie');
  });

  it('les retire au-delà', () => {
    const s = state({
      plan_status: 'past_due',
      plan_expires_at: new Date(NOW - (PLAN_GRACE_DAYS + 1) * DAY).toISOString(),
    });
    expect(isPlanEntitled(s, NOW)).toBe(false);
    expect(effectivePlan(s, NOW)).toBe('discovery');
  });

  it('une annulation ne bénéficie d’aucune grâce', () => {
    // Quelqu'un l'a décidé : ce n'est pas un oubli à rattraper.
    const s = state({
      plan_status: 'canceled',
      plan_expires_at: new Date(NOW - 1 * DAY).toISOString(),
    });
    expect(isPlanEntitled(s, NOW)).toBe(false);
  });

  it('les plans hors barème ne sont jamais concernés', () => {
    for (const plan of ['foundation', 'discovery'] as const) {
      const s = state({ plan, plan_status: 'past_due' });
      expect(isPlanEntitled(s, NOW)).toBe(true);
      expect(isInPlanGrace(s, NOW)).toBe(false);
    }
  });

  it('un plan sans échéance dépend du seul statut', () => {
    expect(isPlanEntitled(state({ plan_expires_at: null }), NOW)).toBe(true);
    expect(
      isPlanEntitled(
        state({ plan_expires_at: null, plan_status: 'past_due' }),
        NOW
      )
    ).toBe(false);
  });
});

/**
 * La séquence de relance, reproduite ici à l'identique du cron : c'est une
 * règle de calendrier, et la tester à travers un handler complet aurait
 * demandé de simuler quatre passages quotidiens.
 */
const STAGES = [-14, -3, 0, 7];
function dueStage(expMs: number, lastMs: number, nowMs: number): number | null {
  for (let i = STAGES.length - 1; i >= 0; i -= 1) {
    const at = expMs + STAGES[i] * DAY;
    if (nowMs >= at && !(Number.isFinite(lastMs) && lastMs >= at)) {
      return STAGES[i];
    }
  }
  return null;
}

describe('séquence de relance', () => {
  const exp = NOW; // échéance = maintenant, on fait varier « maintenant ».

  it('ne dit rien avant la première étape', () => {
    expect(dueStage(exp, NaN, exp - 20 * DAY)).toBeNull();
  });

  it('envoie chaque étape une fois, dans l’ordre', () => {
    let last = NaN;
    const sent: number[] = [];
    // Un passage par jour, de J-20 à J+10.
    for (let d = -20; d <= 10; d += 1) {
      const now = exp + d * DAY;
      const stage = dueStage(exp, last, now);
      if (stage !== null) {
        sent.push(stage);
        last = now;
      }
    }
    expect(sent).toEqual([-14, -3, 0, 7]);
  });

  it('ne renvoie pas une étape déjà envoyée', () => {
    const justSent = exp - 14 * DAY;
    expect(dueStage(exp, justSent, justSent + 1 * DAY)).toBeNull();
  });

  it('rattrape la bonne étape après une panne de plusieurs jours', () => {
    // Le cron n'a pas tourné depuis J-14 : au réveil à J+2, c'est l'étape du
    // jour de l'échéance qui compte, pas celle d'il y a deux semaines.
    expect(dueStage(exp, exp - 14 * DAY, exp + 2 * DAY)).toBe(0);
  });
});
