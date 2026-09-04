// utils/billing/apiPlanGate.ts
//
// Gate PLAN pour le produit payant « API » (clés `tenant_api_tokens`).
//
// Une clé API de tenant est un produit facturé : selon le plan effectif du
// tenant (cf. utils/billing/planFeatures.ts), elle a droit à la LECTURE
// (`apiRead`, plan Régie+) et/ou à l'ÉCRITURE (`apiWrite`, plan Circuit+). Ce
// module traduit une action HTTP/GraphQL (`read` | `write`) en capacité
// requise, puis vérifie l'entitlement du tenant via `tenantHasCapability`.
//
// PÉRIMÈTRE : ce gate concerne UNIQUEMENT le chemin d'auth par
// `tenant_api_tokens` (API publique authentifiée REST + GraphQL). Il ne touche
// PAS l'API bot (`/api/bot/v1/*`, auth BOT_API_KEY global + x-tenant-id), ni les
// endpoints publics anonymes, ni l'admin staff.
//
// Le tenant flagship `foundation` a toutes les capacités → ce gate ne le mord
// jamais. Un plan payant expiré / past_due retombe sur `discovery` (via
// `effectivePlan`) → `discovery` n'a ni apiRead ni apiWrite, donc 403.

import {
  tenantHasCapability,
  PLAN_LABELS,
  type TenantPlanState,
} from './planFeatures';

/** Action d'accès dérivée de la méthode HTTP (ou du suffixe de scope GraphQL). */
export type ApiAccessAction = 'read' | 'write';

/** Capacité `PlanFeatures` requise par une action d'accès API. */
export type ApiRequiredCapability = 'apiRead' | 'apiWrite';

/** Corps 403 normalisé renvoyé quand le plan du tenant est insuffisant. */
export type ApiPlanDenial = {
  error: 'plan_required';
  message: string;
  requiredCapability: ApiRequiredCapability;
};

/** Les méthodes HTTP sûres sont des lectures ; tout le reste est une écriture. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Traduit une méthode HTTP en action d'accès (`read` pour GET/HEAD/OPTIONS). */
export function apiActionForMethod(
  method: string | undefined
): ApiAccessAction {
  return SAFE_METHODS.has((method ?? '').toUpperCase()) ? 'read' : 'write';
}

/** Capacité requise pour une action d'accès. */
export function requiredCapabilityFor(
  action: ApiAccessAction
): ApiRequiredCapability {
  return action === 'write' ? 'apiWrite' : 'apiRead';
}

/**
 * Message d'upgrade actionnable : indique quel palier débloque l'action.
 * - lecture  → Régie (premier plan payant avec `apiRead`).
 * - écriture → Circuit (premier plan avec `apiWrite` ; Régie a la lecture seule).
 */
function upgradeMessage(action: ApiAccessAction): string {
  if (action === 'write') {
    return (
      `Cette clé API en écriture nécessite le plan ${PLAN_LABELS.circuit}. ` +
      `Le plan ${PLAN_LABELS.regie} n'ouvre que la lecture. Mettez à niveau ` +
      `votre abonnement pour écrire via l'API.`
    );
  }
  return (
    `Cette clé API en lecture nécessite au minimum le plan ${PLAN_LABELS.regie}. ` +
    `Mettez à niveau votre abonnement pour lire via l'API.`
  );
}

/**
 * Le tenant a-t-il droit à cette action API à l'instant `nowMs` ?
 *
 * @returns `null` si l'accès est autorisé, sinon un corps `ApiPlanDenial` (403)
 *          expliquant quel plan débloque l'action. `foundation` renvoie
 *          toujours `null` ; un tenant `discovery` / plan payant expiré est
 *          refusé en lecture ET en écriture.
 */
export function checkTenantApiPlan(
  plan: TenantPlanState,
  action: ApiAccessAction,
  nowMs: number = Date.now()
): ApiPlanDenial | null {
  const capability = requiredCapabilityFor(action);
  if (tenantHasCapability(plan, capability, nowMs)) return null;
  return {
    error: 'plan_required',
    message: upgradeMessage(action),
    requiredCapability: capability,
  };
}

/** État d'accès d'une clé API : son exemption partenaire + le plan du tenant. */
export type ApiTokenAccessState = {
  /** Exemption partenaire (`tenant_api_tokens.comp`) : bypass total du plan. */
  comp: boolean;
  /** État plan du tenant propriétaire (base de l'entitlement facturé). */
  plan: TenantPlanState;
};

/**
 * Décision d'accès API pour une CLÉ (comp-aware), à l'instant `nowMs`.
 *
 * Ordre : `comp` d'abord — une clé marquée « partenaire / gratuite » bypasse
 * ENTIÈREMENT le gate de plan (read + write accordés quel que soit le plan du
 * tenant, y compris `discovery` ou plan expiré). Sinon, on retombe sur la
 * vérification d'entitlement normale (`checkTenantApiPlan`).
 *
 * @returns `null` si l'accès est autorisé, sinon `ApiPlanDenial` (403).
 */
export function checkApiTokenAccess(
  token: ApiTokenAccessState,
  action: ApiAccessAction,
  nowMs: number = Date.now()
): ApiPlanDenial | null {
  if (token.comp) return null;
  return checkTenantApiPlan(token.plan, action, nowMs);
}
