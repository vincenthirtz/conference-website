// utils/billing/apiQuota.ts
//
// Quota + rate-limit DURABLE (partagé entre instances) de la surface API
// AUTHENTIFIÉE (token). S'appuie sur la table `api_usage_counters` + la RPC
// `consume_api_usage` (cf. migration add_api_usage_counters.sql).
//
// Deux fenêtres fixed-window par tenant :
//   - minute → rate-limit court (features.apiRateLimitPerMin),
//   - month  → quota mensuel   (features.apiMonthlyQuota).
//
// Court-circuit : un plan illimité sur LES DEUX fenêtres (foundation/editor) ne
// touche pas la DB. Fail-open : toute erreur infra (DB indispo / RPC KO) laisse
// passer — on ne bloque JAMAIS un client payant sur une panne de compteur.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  effectivePlan,
  getPlanFeatures,
  type TenantPlanState,
} from './planFeatures';

export type QuotaResult =
  | {
      ok: true;
      minuteLimit: number;
      minuteRemaining: number;
      monthLimit: number;
      monthUsed: number;
    }
  | {
      ok: false;
      scope: 'minute' | 'month';
      limit: number;
      used: number;
      retryAfterSec: number;
    };

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Clé fixed-window minute en UTC : 'YYYYMMDDHHMM'. */
export function minuteKey(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}` +
    `${pad(now.getUTCDate(), 2)}${pad(now.getUTCHours(), 2)}` +
    `${pad(now.getUTCMinutes(), 2)}`
  );
}

/** Clé fixed-window mois en UTC : 'YYYYMM'. */
export function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}`;
}

function secondsToNextMinute(now: Date): number {
  return Math.max(1, 60 - now.getUTCSeconds());
}

function secondsToNextMonthUTC(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

const UNLIMITED: Extract<QuotaResult, { ok: true }> = {
  ok: true,
  minuteLimit: Infinity,
  minuteRemaining: Infinity,
  monthLimit: Infinity,
  monthUsed: 0,
};

/**
 * Consomme 1 unité de quota pour un tenant et renvoie s'il peut continuer.
 * Incrémente les compteurs durables minute+month (1 RPC) puis compare aux
 * limites du plan EFFECTIF.
 */
export async function consumeApiQuota(
  tenantId: string,
  plan: TenantPlanState,
  now: Date = new Date()
): Promise<QuotaResult> {
  const features = getPlanFeatures(effectivePlan(plan, now.getTime()));
  const minuteLimit = features.apiRateLimitPerMin;
  const monthLimit = features.apiMonthlyQuota;

  // Illimité sur les deux fenêtres → aucun compteur (pas d'écriture DB).
  if (!Number.isFinite(minuteLimit) && !Number.isFinite(monthLimit)) {
    return UNLIMITED;
  }
  if (!supabaseAdmin) {
    return UNLIMITED; // fail-open : pas de DB → on ne bloque pas.
  }

  let minuteCount: number;
  let monthCount: number;
  try {
    const { data, error } = await supabaseAdmin.rpc('consume_api_usage', {
      p_tenant_id: tenantId,
      p_minute_key: minuteKey(now),
      p_month_key: monthKey(now),
    });
    if (error || !data) {
      logger.error('[apiQuota] consume_api_usage RPC error', error);
      return UNLIMITED; // fail-open sur erreur infra.
    }
    const row = Array.isArray(data) ? data[0] : data;
    minuteCount = Number(row?.minute_count ?? 0);
    monthCount = Number(row?.month_count ?? 0);
  } catch (err) {
    logger.error('[apiQuota] consume_api_usage threw', err);
    return UNLIMITED; // fail-open.
  }

  // Quota mensuel prioritaire (dépassement plus « dur » qu'une rafale minute).
  if (Number.isFinite(monthLimit) && monthCount > monthLimit) {
    return {
      ok: false,
      scope: 'month',
      limit: monthLimit,
      used: monthCount,
      retryAfterSec: secondsToNextMonthUTC(now),
    };
  }
  if (Number.isFinite(minuteLimit) && minuteCount > minuteLimit) {
    return {
      ok: false,
      scope: 'minute',
      limit: minuteLimit,
      used: minuteCount,
      retryAfterSec: secondsToNextMinute(now),
    };
  }

  return {
    ok: true,
    minuteLimit,
    minuteRemaining: Number.isFinite(minuteLimit)
      ? Math.max(0, minuteLimit - minuteCount)
      : Infinity,
    monthLimit,
    monthUsed: monthCount,
  };
}
