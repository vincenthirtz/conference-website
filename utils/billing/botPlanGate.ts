// utils/billing/botPlanGate.ts
//
// Gate PLAN pour l'API bot Discord (`/api/bot/v1/*`).
//
// Le bot maison est multi-tenant (une `BOT_API_KEY` par tenant seedée dans
// `tenant_secrets` ; l'auth résout le tenant depuis la clé — cf. utils/botAuth.ts).
// Certaines features du bot sont des produits payants « Régie solidaire » : le
// run-of-show / production (`discordEventOps: 'full'`), l'arbitrage des litiges
// (`arbitration`) et le rating joueur (`ratings`). Ce module traduit une
// EXIGENCE de capacité déclarée par une route en décision d'accès, à partir du
// plan effectif du tenant (cf. utils/billing/planFeatures.ts).
//
// DEUX niveaux (tous deux sur les routes TENANT-SCOPÉES ; les routes
// `crossTenant` — outbox pending/handled/ack — sont l'infra du bot, jamais
// gatées) :
//   - BASELINE `discordBot` : le bot lui-même est réservé à la Coupe féminine
//     (`foundation`) et aux plans payants. `withBotRoute` le vérifie sur TOUTE
//     route tenant-scopée → un tenant `discovery` (gratuit) n'a PAS le bot (403
//     sur toute route, base comprise). Seuls les admins Women's Cup utilisent le
//     bot sans plan.
//   - PREMIUM (`discordEventOps:full`, `arbitration`, `ratings`) : les routes de
//     production live / arbitrage déclarent `requireCapability` en plus.
//
// Le tenant flagship `foundation` a toutes les capacités → ce gate ne le mord
// jamais. Un plan payant expiré / past_due retombe sur `discovery` (via
// `effectivePlan`) → 403 (plus de bot du tout).

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import {
  tenantFeatures,
  PLAN_LABELS,
  type TenantPlanState,
  type TenantPlan,
  type PlanStatus,
} from './planFeatures';

/**
 * Exigence de capacité déclarée par une route bot premium.
 *
 * - `discordEventOps:full` : run-of-show / production (Director, cast, veto,
 *   drafts, broadcast on-air, events, runs). Tout plan qui n'est pas en `'full'`
 *   prend un 403 sur ces routes.
 * - `arbitration` : arbitrage litiges (disputes, resolve-dispute, blacklist-alert).
 * - `ratings` : rating joueur Glicko-2 (réservé pour de futurs endpoints bot).
 *
 * Ces trois capacités s'ouvrent au premier plan payant `regie` (Régie+) — c'est
 * le message d'upgrade renvoyé.
 */
export type BotCapabilityRequirement =
  | 'discordBot'
  | 'discordEventOps:full'
  | 'arbitration'
  | 'ratings';

/** Corps 403 normalisé renvoyé quand le plan du tenant est insuffisant. */
export type BotPlanDenial = {
  error: 'plan_required';
  message: string;
  requiredCapability: BotCapabilityRequirement;
};

/**
 * État plan par défaut quand la row `tenants` est introuvable / dépourvue des
 * colonnes de plan. Fail-closed sur le palier gratuit `discovery` : un tenant
 * dont on ne peut pas prouver l'entitlement premium n'accède PAS aux features
 * payantes (mais garde les features de base, non gatées). En pratique la row
 * existe (l'auth a résolu le tenant depuis `tenant_secrets`) et la migration
 * billing garantit les colonnes → ce fallback ne mord que sur un état corrompu.
 */
export const BOT_FALLBACK_PLAN_STATE: TenantPlanState = {
  plan: 'discovery',
  plan_status: 'active',
  plan_expires_at: null,
};

/**
 * Cache court (60 s) du plan par tenant. Le gate BASELINE charge le plan à
 * CHAQUE appel bot tenant-scopé (le bot poll souvent) → on évite un round-trip
 * DB par requête. TTL court : un plan fraîchement activé (webhook HelloAsso)
 * prend effet en ≤ 60 s. `__resetBotPlanCacheForTests` purge en test.
 */
const BOT_PLAN_CACHE_TTL_MS = 60_000;
const botPlanCache = new Map<
  string,
  { state: TenantPlanState; expiresAt: number }
>();

export function __resetBotPlanCacheForTests(): void {
  botPlanCache.clear();
}

/**
 * Charge `{ plan, plan_status, plan_expires_at }` d'un tenant pour le gate bot.
 * Fail-closed sur `discovery` (cf. BOT_FALLBACK_PLAN_STATE) si la row est
 * absente / la requête échoue. Résultat caché 60 s par tenant.
 */
export async function loadTenantPlanStateForBot(
  tenantId: string
): Promise<TenantPlanState> {
  const now = Date.now();
  const cached = botPlanCache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.state;

  if (!supabaseAdmin) return BOT_FALLBACK_PLAN_STATE;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[bot/plan] tenant plan lookup error', error);
    return BOT_FALLBACK_PLAN_STATE; // erreur transitoire → ne pas cacher
  }
  if (!data) return BOT_FALLBACK_PLAN_STATE;

  const state: TenantPlanState = {
    plan: (data.plan as TenantPlan) ?? BOT_FALLBACK_PLAN_STATE.plan,
    plan_status:
      (data.plan_status as PlanStatus) ?? BOT_FALLBACK_PLAN_STATE.plan_status,
    plan_expires_at:
      (data.plan_expires_at as string | null) ??
      BOT_FALLBACK_PLAN_STATE.plan_expires_at,
  };
  botPlanCache.set(tenantId, {
    state,
    expiresAt: now + BOT_PLAN_CACHE_TTL_MS,
  });
  return state;
}

/** Le tenant satisfait-il l'exigence de capacité, à l'instant `nowMs` ? */
function tenantSatisfies(
  plan: TenantPlanState,
  requirement: BotCapabilityRequirement,
  nowMs: number
): boolean {
  const features = tenantFeatures(plan, nowMs);
  switch (requirement) {
    case 'discordBot':
      return features.discordBot === true;
    case 'discordEventOps:full':
      return features.discordEventOps === 'full';
    case 'arbitration':
      return features.arbitration === true;
    case 'ratings':
      return features.ratings === true;
    default:
      // Exhaustif : toute nouvelle exigence doit être gérée explicitement.
      return false;
  }
}

/** Message d'upgrade actionnable — toutes ces capacités s'ouvrent à `regie`. */
function upgradeMessage(requirement: BotCapabilityRequirement): string {
  switch (requirement) {
    case 'discordBot':
      return (
        `Le bot Discord est réservé à la Coupe féminine et aux organisations ` +
        `sur un plan payant (au minimum ${PLAN_LABELS.regie}). Souscrivez un ` +
        `abonnement pour activer le bot sur votre serveur.`
      );
    case 'discordEventOps:full':
      return (
        `Cette fonctionnalité de régie (run-of-show, cast, veto, production) ` +
        `nécessite au minimum le plan ${PLAN_LABELS.regie}. Mettez à niveau ` +
        `votre abonnement pour l'activer.`
      );
    case 'arbitration':
      return (
        `L'arbitrage des litiges nécessite au minimum le plan ${PLAN_LABELS.regie}. ` +
        `Mettez à niveau votre abonnement pour l'activer.`
      );
    case 'ratings':
      return (
        `Le rating joueur nécessite au minimum le plan ${PLAN_LABELS.regie}. ` +
        `Mettez à niveau votre abonnement pour l'activer.`
      );
  }
}

/**
 * Le tenant a-t-il droit à cette capacité bot à l'instant `nowMs` ?
 *
 * @returns `null` si l'accès est autorisé, sinon un corps `BotPlanDenial` (403)
 *          expliquant quel plan débloque la feature. `foundation` renvoie
 *          toujours `null` ; un tenant `discovery` / plan payant expiré est
 *          refusé sur les capacités premium.
 */
export function checkBotPlanCapability(
  plan: TenantPlanState,
  requirement: BotCapabilityRequirement,
  nowMs: number = Date.now()
): BotPlanDenial | null {
  if (tenantSatisfies(plan, requirement, nowMs)) return null;
  return {
    error: 'plan_required',
    message: upgradeMessage(requirement),
    requiredCapability: requirement,
  };
}
