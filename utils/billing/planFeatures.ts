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
  /**
   * Accès à l'API du bot Discord maison. RÉSERVÉ à la Coupe féminine
   * (`foundation`) et aux plans payants : le palier gratuit `discovery` n'a PAS
   * le bot (ni base, ni premium). Seuls les admins Women's Cup utilisent le bot
   * sans plan.
   */
  discordBot: boolean;
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
  /**
   * Débit max de requêtes API AUTHENTIFIÉES (token) par minute et par tenant.
   * `Infinity` = illimité (le compteur durable Postgres est alors court-circuité,
   * pas d'écriture DB). Ne s'applique PAS aux lectures anonymes /api/public/v1/*
   * (limitées par IP en mémoire).
   */
  apiRateLimitPerMin: number;
  /** Quota mensuel de requêtes API authentifiées par tenant (Infinity = illimité). */
  apiMonthlyQuota: number;
};

const FEATURES: Record<TenantPlan, PlanFeatures> = {
  foundation: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: true,
    multiTenant: true,
    discordBot: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
    // Flagship (Coupe féminine) : illimité → compteur durable court-circuité.
    apiRateLimitPerMin: Infinity,
    apiMonthlyQuota: Infinity,
  },
  discovery: {
    whiteLabel: false,
    apiRead: false,
    apiWrite: false,
    multiTenant: false,
    discordBot: false,
    discordEventOps: 'none',
    arbitration: false,
    ratings: false,
    maxLeagues: 0,
    priorityArbitration: false,
    // Pas d'API (bloqué par le gate plan avant même le quota).
    apiRateLimitPerMin: 0,
    apiMonthlyQuota: 0,
  },
  regie: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: false,
    multiTenant: false,
    discordBot: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: 1,
    priorityArbitration: false,
    apiRateLimitPerMin: 60,
    apiMonthlyQuota: 100_000,
  },
  circuit: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: true,
    multiTenant: true,
    discordBot: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
    apiRateLimitPerMin: 120,
    apiMonthlyQuota: 500_000,
  },
  editor: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: true,
    multiTenant: true,
    discordBot: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
    // Sur-devis / haut de gamme : illimité.
    apiRateLimitPerMin: Infinity,
    apiMonthlyQuota: Infinity,
  },
};

/** Capacités brutes d'un plan (sans tenir compte de l'entitlement). */
export function getPlanFeatures(plan: TenantPlan): PlanFeatures {
  return FEATURES[plan] ?? FEATURES.discovery;
}

/**
 * Période de grâce après échéance (T10).
 *
 * Avant, la bascule était sèche : un plan qui expirait — ou passait `past_due`
 * — retombait IMMÉDIATEMENT sur `discovery`, c'est-à-dire sans bot Discord, du
 * jour au lendemain, pour un retard de paiement d'une journée. Sept jours
 * laissent le temps qu'un virement arrive et qu'un humain réponde à un email.
 *
 * La grâce ne s'applique QU'À l'expiration : un plan `canceled` s'arrête tout
 * de suite, parce que quelqu'un l'a décidé.
 */
export const PLAN_GRACE_DAYS = 7;
const GRACE_MS = PLAN_GRACE_DAYS * 86_400_000;

/**
 * Le tenant a-t-il droit aux capacités de SON plan payant ?
 * - `foundation`/`discovery` : toujours (l'un est offert par mission, l'autre
 *   est le palier gratuit).
 * - plans payants : `active` non expiré, ou dans la grâce post-échéance.
 */
export function isPlanEntitled(t: TenantPlanState, nowMs: number): boolean {
  if (t.plan === 'foundation' || t.plan === 'discovery') return true;
  // Une annulation est une décision, pas un oubli : elle ne se rattrape pas.
  if (t.plan_status === 'canceled') return false;
  if (t.plan_status !== 'active' && t.plan_status !== 'past_due') return false;

  const expiry = t.plan_expires_at
    ? new Date(t.plan_expires_at).getTime()
    : null;
  if (expiry === null) {
    // Pas d'échéance : seul un statut actif ouvre les droits.
    return t.plan_status === 'active';
  }
  return nowMs <= expiry + GRACE_MS;
}

/** Le plan est-il honoré uniquement grâce à la période de grâce ? */
export function isInPlanGrace(t: TenantPlanState, nowMs: number): boolean {
  if (t.plan === 'foundation' || t.plan === 'discovery') return false;
  if (!t.plan_expires_at) return false;
  const expiry = new Date(t.plan_expires_at).getTime();
  return (
    isPlanEntitled(t, nowMs) && nowMs > expiry && nowMs <= expiry + GRACE_MS
  );
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

/**
 * Prix annuel public d'un plan, EN EUROS (pas en centimes).
 *
 * Source unique du barème « Régie solidaire ». Le paiement passe par HelloAsso
 * (don ciblé tenant+plan) ; l'endpoint de génération de lien convertit en
 * centimes (`* 100`) pour l'API checkout-intents.
 *
 * - `foundation` / `discovery` : gratuit (0). La Fondation est offerte par
 *   mission ; Découverte est le palier gratuit à marque partagée.
 * - `regie` : 290 €/an. `circuit` : 790 €/an.
 * - `editor` : `null` = sur-devis (pas de prix catalogue → pas de lien
 *   self-service ; un accord commercial fixe le montant hors barème).
 *
 * `null` signifie explicitement « pas de tarif catalogue » (≠ gratuit).
 */
export const PLAN_PRICES_EUR: Record<TenantPlan, number | null> = {
  foundation: 0,
  discovery: 0,
  regie: 290,
  circuit: 790,
  editor: null,
};

/**
 * Plans qu'un owner peut activer/renouveler via un lien de paiement HelloAsso
 * ciblé : ceux qui ont un prix catalogue strictement positif. `editor`
 * (sur-devis) et les paliers gratuits en sont exclus.
 */
export type PurchasablePlan = 'regie' | 'circuit';

/**
 * Un plan est-il « achetable » en self-service (prix catalogue > 0) ?
 * Narrows le type vers `PurchasablePlan` pour l'extraction typée côté API.
 */
export function isPurchasablePlan(plan: string): plan is PurchasablePlan {
  const price = PLAN_PRICES_EUR[plan as TenantPlan];
  return (plan === 'regie' || plan === 'circuit') && typeof price === 'number';
}
