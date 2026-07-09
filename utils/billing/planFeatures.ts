// utils/billing/planFeatures.ts
//
// Source unique de vérité du modèle économique « Régie solidaire » (Phase 0).
//
// Chaque tenant porte un `plan` (colonnes ajoutées par
// database/migrations/add_billing_plan_to_tenants.sql). Ce module traduit un
// plan en capacités concrètes, et gère l'ENTITLEMENT : un plan payant dont
// l'abonnement a expiré ou n'est plus `active` retombe sur les capacités du
// plan gratuit `discovery` (downgrade progressif, pas de coupure brutale). Le
// gating (API, white-label, multi-tenant) consomme ces helpers — jamais le
// `plan` brut.
//
// Règle produit : le tenant flagship (Coupe féminine) est en `foundation` —
// tout, gratuit, sans expiration. `discovery` est le palier gratuit (marque
// partagée) : ni API ni white-label. `regie`/`circuit`/`editor` sont payants.

export type TenantPlan =
  | 'foundation'
  | 'discovery'
  | 'regie'
  | 'circuit'
  | 'editor';

export type PlanStatus = 'active' | 'past_due' | 'canceled';

/** Sous-ensemble d'un tenant nécessaire au calcul d'entitlement. */
export type TenantPlanState = {
  plan: TenantPlan;
  plan_status: PlanStatus;
  /** ISO string ; null = pas d'expiration (ex. foundation). */
  plan_expires_at: string | null;
};

export type DiscordEventOps = 'none' | 'basic' | 'full';

export type PlanFeatures = {
  /** Tenant dédié : branding, slug/sous-domaine, custom domain, site + CMS. */
  whiteLabel: boolean;
  /** Clés API en lecture (public v1 authentifié, tokens read). */
  apiRead: boolean;
  /** Clés API en écriture / bot Discord custom. */
  apiWrite: boolean;
  /** Gérer plusieurs tenants (réseau / agence). */
  multiTenant: boolean;
  /** Profondeur des opérations Discord (Director, waves/stations, voice). */
  discordEventOps: DiscordEventOps;
  /** Arbitrage litiges + SLA + dashboard. */
  arbitration: boolean;
  /** Rating joueur Glicko-2. */
  ratings: boolean;
  /** Nombre de ligues/saisons simultanées (Infinity = illimité). */
  maxLeagues: number;
  /** File d'arbitrage prioritaire. */
  priorityArbitration: boolean;
};

const FEATURES: Record<TenantPlan, PlanFeatures> = {
  foundation: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: true,
    multiTenant: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
  },
  discovery: {
    whiteLabel: false,
    apiRead: false,
    apiWrite: false,
    multiTenant: false,
    discordEventOps: 'basic',
    arbitration: false,
    ratings: false,
    maxLeagues: 0,
    priorityArbitration: false,
  },
  regie: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: false,
    multiTenant: false,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: 1,
    priorityArbitration: false,
  },
  circuit: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: true,
    multiTenant: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
  },
  editor: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: true,
    multiTenant: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
  },
};

/** Capacités brutes d'un plan (sans tenir compte de l'entitlement). */
export function getPlanFeatures(plan: TenantPlan): PlanFeatures {
  return FEATURES[plan] ?? FEATURES.discovery;
}

/**
 * Le tenant a-t-il droit aux capacités de SON plan payant ?
 * - `foundation`/`discovery` : toujours (l'un est offert par mission, l'autre
 *   est le palier gratuit).
 * - plans payants : uniquement si `plan_status === 'active'` ET non expiré.
 */
export function isPlanEntitled(t: TenantPlanState, nowMs: number): boolean {
  if (t.plan === 'foundation' || t.plan === 'discovery') return true;
  if (t.plan_status !== 'active') return false;
  if (t.plan_expires_at && new Date(t.plan_expires_at).getTime() <= nowMs) {
    return false;
  }
  return true;
}

/**
 * Plan EFFECTIF : le plan facturé s'il est honoré, sinon `discovery`
 * (downgrade automatique à l'expiration / au past_due). C'est ce plan qui
 * détermine les capacités réellement accordées.
 */
export function effectivePlan(t: TenantPlanState, nowMs: number): TenantPlan {
  if (t.plan === 'foundation' || t.plan === 'discovery') return t.plan;
  return isPlanEntitled(t, nowMs) ? t.plan : 'discovery';
}

/** Capacités EFFECTIVES d'un tenant (plan effectif après entitlement). */
export function tenantFeatures(
  t: TenantPlanState,
  nowMs: number = Date.now()
): PlanFeatures {
  return getPlanFeatures(effectivePlan(t, nowMs));
}

/** Un tenant possède-t-il une capacité booléenne donnée, à l'instant `nowMs` ? */
export function tenantHasCapability(
  t: TenantPlanState,
  capability: {
    [K in keyof PlanFeatures]: PlanFeatures[K] extends boolean ? K : never;
  }[keyof PlanFeatures],
  nowMs: number = Date.now()
): boolean {
  return tenantFeatures(t, nowMs)[capability] === true;
}

/** Libellés courts (UI / messages d'upgrade). */
export const PLAN_LABELS: Record<TenantPlan, string> = {
  foundation: 'Fondation',
  discovery: 'Découverte',
  regie: 'Régie',
  circuit: 'Circuit',
  editor: 'Éditeur',
};
