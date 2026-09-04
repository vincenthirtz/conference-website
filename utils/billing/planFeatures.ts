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
// tout, gratuit, sans expiration. `discovery`, `regie` et `circuit` sont les
// trois offres facturées.
//
// Le palier `editor` est sur devis (`PLAN_PRICES_EUR.editor = null`) : il ne se
// paie pas en self-service, il se négocie. Ce qu'il ajoute à Circuit n'est pas
// une capacité de plus dans la plateforme mais un LOGICIEL — Womenscup OBS,
// notre régie vidéo — et son déploiement ne rentre pas dans un formulaire.
// `null` ≠ 0 : le barème dit « pas de tarif catalogue », et `isPurchasablePlan`
// le refuse donc au paiement en ligne sans qu'on ait à l'y lister à la main.

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

/**
 * Profondeur des opérations Discord.
 *
 * Le cran `'basic'` a existé entre les deux : aucun plan ne l'a jamais porté, et
 * un commentaire de botPlanGate a longtemps affirmé que `discovery` y était —
 * ce qui était faux depuis toujours. Une gradation que personne n'emprunte
 * n'est pas une nuance, c'est une promesse que la grille ne peut pas tenir.
 */
export type DiscordEventOps = 'none' | 'full';

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
  /**
   * Régie vidéo : direction automatique (l'état de diffusion suit les matchs)
   * et overlays OBS. C'est la marche qui manquait entre Régie et Circuit —
   * les deux étaient à égalité sur `discordEventOps: 'full'`, donc rien dans le
   * code ne distinguait 29 € de 79 € sur l'axe production.
   */
  broadcastStudio: boolean;
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
    broadcastStudio: true,
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
    broadcastStudio: false,
    maxLeagues: 0,
    priorityArbitration: false,
    // Pas d'API (bloqué par le gate plan avant même le quota).
    apiRateLimitPerMin: 0,
    apiMonthlyQuota: 0,
  },
  // Régie garde TOUTE la production Discord (cast, veto, drafts, run-of-show).
  // Ce qui lui manque, c'est la régie vidéo elle-même.
  regie: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: false,
    multiTenant: false,
    discordBot: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    broadcastStudio: false,
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
    broadcastStudio: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
    apiRateLimitPerMin: 120,
    apiMonthlyQuota: 500_000,
  },
  // Sur devis : tout Circuit, plus Womenscup OBS déployé chez le client.
  // Techniquement identique au plafond ; ce qui se vend en plus est un logiciel
  // et l'accompagnement qui va avec, pas une case du barème.
  editor: {
    whiteLabel: true,
    apiRead: true,
    apiWrite: true,
    multiTenant: true,
    discordBot: true,
    discordEventOps: 'full',
    arbitration: true,
    ratings: true,
    broadcastStudio: true,
    maxLeagues: Infinity,
    priorityArbitration: true,
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
 * - `foundation` : offerte par mission (0), c'est la Coupe elle-même.
 * - `discovery` : 100 €/an, soit 10 €/mois. Ce palier a DEUX rôles qu'il faut
 *   distinguer : c'est une OFFRE d'entrée facturée, et c'est aussi l'état vers
 *   lequel `effectivePlan()` fait retomber un plan payant qui n'est plus
 *   honoré. Le second n'encaisse rien — un espace qui cesse de payer n'est pas
 *   facturé, il perd simplement ce que son plan lui donnait en plus.
 * - `regie` : 290 €/an. `circuit` : 790 €/an.
 * `null` reste une valeur possible du type : elle signifie « pas de tarif
 * catalogue » (≠ gratuit), et le code la traite déjà partout — un futur palier
 * sur-devis n'aurait rien à réécrire.
 */
export const PLAN_PRICES_EUR: Record<TenantPlan, number | null> = {
  foundation: 0,
  // 10 €/mois × 10 mois facturés : la règle des deux mois offerts s'applique
  // ici comme ailleurs, plutôt qu'un prix annuel posé à côté du mensuel.
  discovery: 100,
  regie: 290,
  circuit: 790,
  // Sur devis : `null` ≠ 0. Le barème dit « pas de tarif catalogue », ce qui
  // suffit à exclure ce palier du paiement en ligne (isPurchasablePlan).
  editor: null,
};

/**
 * Périodicité d'un paiement de plan.
 *
 * L'année reste la référence du barème ; le mois existe parce qu'une petite
 * association ne sort pas 290 € d'un coup en janvier, et qu'un tarif annuel
 * seul écarte exactement les organisateurs qu'on veut servir.
 */
export type PlanTerm = 'month' | 'year';

/**
 * Ce que « payer à l'année » fait gagner, exprimé en mois payés.
 *
 * 10 mois payés pour 12 : deux mois offerts. Le chiffre est ici, seul, parce
 * qu'un prix mensuel recopié à la main finirait par contredire l'annuel — et
 * c'est le genre de contradiction qu'on découvre sur une facture.
 */
export const YEARLY_MONTHS_BILLED = 10;

/**
 * Prix MENSUEL public, dérivé de l'annuel. Arrondi à l'euro : un « 29,17 € »
 * sur une grille tarifaire ne dit rien de plus qu'un « 29 € », et coûte une
 * ligne de calcul mental au lecteur.
 */
export const PLAN_PRICES_MONTHLY_EUR: Record<TenantPlan, number | null> =
  Object.fromEntries(
    (Object.keys(PLAN_PRICES_EUR) as TenantPlan[]).map((plan) => {
      const yearly = PLAN_PRICES_EUR[plan];
      if (yearly === null) return [plan, null];
      if (yearly === 0) return [plan, 0];
      return [plan, Math.round(yearly / YEARLY_MONTHS_BILLED)];
    })
  ) as Record<TenantPlan, number | null>;

/** Le prix d'un plan pour une périodicité donnée. `null` = pas de barème. */
export function planPrice(plan: TenantPlan, term: PlanTerm): number | null {
  return term === 'month'
    ? PLAN_PRICES_MONTHLY_EUR[plan]
    : PLAN_PRICES_EUR[plan];
}

/**
 * Plans qu'un owner peut activer/renouveler via un lien de paiement HelloAsso
 * ciblé : ceux qui ont un prix catalogue strictement positif. `foundation`,
 * offerte par mission, en est donc exclue.
 */
// `discovery` a rejoint les plans facturés (10 €/mois) : il est donc payable en
// self-service comme les autres. Il reste par ailleurs l'état vers lequel
// `effectivePlan()` fait retomber un plan non honoré — cet état-là n'encaisse
// rien, il retire seulement ce que le plan supérieur donnait.
export type PurchasablePlan = 'discovery' | 'regie' | 'circuit';

/**
 * Un plan est-il « achetable » en self-service ?
 *
 * La réponse se DÉDUIT du barème : un prix catalogue strictement positif, et
 * rien d'autre. La liste était écrite en dur (`regie || circuit`), ce qui
 * contredisait le type dès que Découverte est devenue payante : le type disait
 * « achetable », la fonction disait non, et le lien de paiement était refusé
 * sans que la grille tarifaire n'en dise rien.
 *
 * `foundation` en sort de lui-même (0 €, offerte par mission). Narrows le type
 * pour l'extraction typée côté API.
 */
export function isPurchasablePlan(plan: string): plan is PurchasablePlan {
  const price = PLAN_PRICES_EUR[plan as TenantPlan];
  return typeof price === 'number' && price > 0;
}
