// config/circuitPartnerOffer.ts
//
// Les TERMES de l'offre partenaire des circuits féminins et mixtes : ce qui est
// offert à un circuit retenu, et pour combien de temps.
//
// UN SEUL ENDROIT. La page publique (`/organisateurs/circuits-feminins`) les
// annonce, la route staff qui accorde l'offre (`/api/admin/circuit-partners/
// [id]`) les applique. Les capacités annoncées se lisent ensuite dans
// `utils/billing/planFeatures.ts` depuis `plan` : rien n'est recopié.
//
// POURQUOI UN PLAN ACCORDÉ ET NON UN PLAN NEUF. Le barème des capacités est déjà
// le point de contrôle de tout le produit (bot, ligues, arbitrage, API). Un
// plan « partenaire » à part aurait dû être ajouté à chaque garde — et oublié
// dans l'une d'elles. Le circuit retenu reçoit donc un plan existant, pour une
// durée finie : à l'échéance, l'entitlement habituel le fait retomber sur
// `discovery` (grâce de 7 jours comprise), sauf renouvellement.

import type { TenantPlan } from '@/utils/billing/planFeatures';

export const CIRCUIT_PARTNER_OFFER: {
  /** Plan accordé à l'espace du circuit retenu. */
  plan: TenantPlan;
  /** Durée de l'offre, en mois, à compter de l'accord. */
  months: number;
} = {
  plan: 'circuit',
  months: 12,
};

/** Formats de compétition éligibles. */
export const CIRCUIT_FORMATS = ['feminin', 'mixte'] as const;
export type CircuitFormat = (typeof CIRCUIT_FORMATS)[number];

/** Échéance de l'offre accordée maintenant, en ISO. */
export function circuitOfferExpiry(nowMs: number): string {
  const end = new Date(nowMs);
  end.setUTCMonth(end.getUTCMonth() + CIRCUIT_PARTNER_OFFER.months);
  return end.toISOString();
}
