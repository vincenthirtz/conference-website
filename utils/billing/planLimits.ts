// utils/billing/planLimits.ts
//
// Les limites d'un plan, appliquées.
//
// `PlanFeatures` déclare depuis longtemps `maxLeagues`, `whiteLabel`,
// `multiTenant`… mais seuls le bot, l'API et les quotas passaient réellement par
// un contrôle. `maxLeagues` n'avait AUCUN appelant : un espace `regie`, vendu
// « une ligue », pouvait en créer dix. C'est un problème dans les deux sens —
// le client paie une limite qui n'existe pas, et la plateforme ne peut pas
// vendre le palier au-dessus.
//
// Ce fichier fait deux choses :
//
//   1. `assertPlanLimit()` — un seul point de passage pour les limites qui se
//      COMPTENT (aujourd'hui : les ligues). Il compte, compare, et rend de quoi
//      écrire un refus qui s'explique.
//   2. `PLAN_FEATURE_ENFORCEMENT` — le registre de ce qui applique chaque
//      capacité déclarée. Un test de complétude (tests/unit/planLimits.test.ts)
//      exige qu'une capacité ajoutée à `PlanFeatures` y figure : soit avec son
//      lieu d'application, soit marquée `commercial` et justifiée. Une promesse
//      commerciale sans code derrière reste possible — mais plus par accident.

import { supabaseAdmin } from './../supabase';
import { logger } from './../logger';
import {
  getPlanFeatures,
  effectivePlan,
  PLAN_LABELS,
  type PlanFeatures,
  type PlanStatus,
  type TenantPlan,
} from './planFeatures';

/** Limites qui se comptent : « combien en a-t-il déjà ? ». */
export type CountableLimit = 'leagues';

const COUNTABLE: Record<
  CountableLimit,
  { table: string; feature: keyof PlanFeatures; softDeleteCol?: string }
> = {
  leagues: { table: 'leagues', feature: 'maxLeagues' },
};

export type PlanLimitVerdict =
  | { ok: true; used: number; max: number }
  | {
      ok: false;
      code: 'PLAN_LIMIT_REACHED';
      limit: CountableLimit;
      used: number;
      max: number;
      plan: TenantPlan;
      planLabel: string;
      /** Premier palier qui lève la limite, s'il existe. */
      upgradeTo: TenantPlan | null;
      upgradeLabel: string | null;
    };

/** Les paliers, du moins au plus permissif. `foundation` n'est pas vendable. */
const UPGRADE_PATH: TenantPlan[] = ['discovery', 'regie', 'circuit'];

function firstPlanAbove(
  current: TenantPlan,
  feature: keyof PlanFeatures,
  needed: number
): TenantPlan | null {
  const from = UPGRADE_PATH.indexOf(current);
  for (const candidate of UPGRADE_PATH.slice(from + 1)) {
    const value = getPlanFeatures(candidate)[feature];
    if (typeof value === 'number' && value >= needed) return candidate;
  }
  return null;
}

/**
 * L'espace peut-il créer une ligne de plus dans ce domaine ?
 *
 * Ne jette jamais : une lecture en erreur AUTORISE (`ok: true`). Un compteur
 * indisponible ne doit pas empêcher un client de travailler — c'est le sens du
 * refus qui doit être sûr, pas son absence.
 */
export async function assertPlanLimit(
  tenantId: string,
  limit: CountableLimit
): Promise<PlanLimitVerdict> {
  const spec = COUNTABLE[limit];

  const { data: tenant, error: tErr } = await supabaseAdmin
    .from('tenants')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (tErr || !tenant) {
    logger.error('[planLimits] tenant load error', tErr);
    return { ok: true, used: 0, max: Infinity };
  }

  const row = tenant as {
    plan: string | null;
    plan_status: string | null;
    plan_expires_at: string | null;
  };
  const plan = effectivePlan(
    {
      plan: (row.plan ?? 'discovery') as TenantPlan,
      plan_status: (row.plan_status ?? 'active') as PlanStatus,
      plan_expires_at: row.plan_expires_at ?? null,
    },
    Date.now()
  );

  const raw = getPlanFeatures(plan)[spec.feature];
  const max = typeof raw === 'number' ? raw : Infinity;

  // Illimité : aucune requête de comptage. Le plan phare ne doit pas payer en
  // latence le prix d'une limite qu'il n'a pas.
  if (max === Infinity) return { ok: true, used: 0, max };

  let q = supabaseAdmin
    .from(spec.table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (spec.softDeleteCol) q = q.is(spec.softDeleteCol, null);

  const { count, error } = await q;
  if (error) {
    logger.error(`[planLimits] count ${spec.table} error`, error);
    return { ok: true, used: 0, max };
  }

  const used = count ?? 0;
  if (used < max) return { ok: true, used, max };

  const upgradeTo = firstPlanAbove(plan, spec.feature, used + 1);
  return {
    ok: false,
    code: 'PLAN_LIMIT_REACHED',
    limit,
    used,
    max,
    plan,
    planLabel: PLAN_LABELS[plan] ?? plan,
    upgradeTo,
    upgradeLabel: upgradeTo ? (PLAN_LABELS[upgradeTo] ?? upgradeTo) : null,
  };
}

/**
 * Corps de refus normalisé — `402 Payment Required`, et non 403 : ce n'est pas
 * une question de droit, c'est une question de palier. Le message NOMME le plan,
 * la limite et le palier qui la lève ; un refus qui ne dit pas comment
 * l'éviter envoie le client au support.
 */
export function planLimitBody(v: Extract<PlanLimitVerdict, { ok: false }>) {
  return {
    error: v.upgradeLabel
      ? `Limite du plan ${v.planLabel} atteinte (${v.used}/${v.max}). Le plan ${v.upgradeLabel} la lève.`
      : `Limite du plan ${v.planLabel} atteinte (${v.used}/${v.max}).`,
    code: v.code,
    limit: v.limit,
    used: v.used,
    max: v.max,
    plan: v.plan,
    upgradeTo: v.upgradeTo,
  };
}

/**
 * Où chaque capacité déclarée est réellement appliquée.
 *
 * `commercial` = assumé : la capacité figure dans l'offre mais aucun code ne la
 * fait respecter, faute de point d'application qui ait un sens aujourd'hui.
 * Le dire ici vaut mieux que de le découvrir en lisant une grille tarifaire.
 */
export const PLAN_FEATURE_ENFORCEMENT: Record<
  keyof PlanFeatures,
  { kind: 'code'; where: string } | { kind: 'commercial'; why: string }
> = {
  whiteLabel: {
    kind: 'code',
    where:
      'utils/tenant.ts (résolution du branding et du domaine propre) + PATCH /api/admin/tenants/[id]',
  },
  apiRead: { kind: 'code', where: 'utils/billing/apiPlanGate.ts' },
  apiWrite: { kind: 'code', where: 'utils/billing/apiPlanGate.ts' },
  discordBot: { kind: 'code', where: 'utils/billing/botPlanGate.ts' },
  discordEventOps: { kind: 'code', where: 'utils/billing/botPlanGate.ts' },
  arbitration: { kind: 'code', where: 'utils/billing/botPlanGate.ts' },
  ratings: { kind: 'code', where: 'utils/billing/botPlanGate.ts' },
  broadcastStudio: {
    kind: 'code',
    where:
      'utils/billing/tenantCapabilityGate.ts → POST/GET /api/admin/broadcast/state + POST /api/admin/broadcast/next-match',
  },
  maxLeagues: {
    kind: 'code',
    where: 'utils/billing/planLimits.ts → POST /api/admin/leagues',
  },
  apiRateLimitPerMin: { kind: 'code', where: 'utils/billing/apiQuota.ts' },
  apiMonthlyQuota: { kind: 'code', where: 'utils/billing/apiQuota.ts' },
  multiTenant: {
    kind: 'commercial',
    why: "L'accès à plusieurs espaces se donne par des lignes `tenant_staff`, pas par un plan : le refuser techniquement couperait un staff déjà rattaché. À reprendre si le rattachement devient self-service.",
  },
  priorityArbitration: {
    kind: 'commercial',
    why: "L'arbitrage est rendu par le staff de CHAQUE espace : il n'existe pas de file commune à prioriser. La capacité n'a de sens que le jour où la plateforme arbitre elle-même.",
  },
};
