// utils/tenants/gateRow.ts
//
// UNE lecture `tenants` pour les trois contrôles que chaque appel bot
// tenant-scopé enchaîne : existence/activité (`isActiveTenantId`), cycle de vie
// (`getTenantLifecycle`) et plan (`loadTenantPlanStateForBot`).
//
// POURQUOI. Chacun avait son cache de 60 s et sa propre requête sur la même
// ligne. Le bot interroge chaque tenant toutes les 1 à 3 minutes (live-announcer,
// mvp-due, reminders…), donc à un rythme voisin du TTL : presque chaque appel
// était un miss, et un miss coûtait jusqu'à TROIS lectures de la même ligne —
// 4 326 GET `tenants` en 24 h mesurés. Ici : une seule requête, un seul cache,
// TTL 120 s, et les appels concurrents d'une même instance partagent la même
// requête en vol.
//
// CE QUI N'EST PAS MIS EN CACHE :
//   - une erreur de lecture : chaque appelant garde son repli historique
//     (lifecycle → `active`, plan → `discovery`, actif → refus), et la
//     tentative suivante relit ;
//   - une ligne absente : un tenant fraîchement créé doit être vu tout de
//     suite, pas deux minutes plus tard.
//
// FRAÎCHEUR. Un changement de plan, de cycle de vie ou d'activité prend effet en
// ≤ 120 s (au lieu de ≤ 60 s). Les écritures connues invalident l'instance
// courante via `invalidateTenantGateRow` (cf. lifecycle.ts) ; les autres
// instances attendent le TTL. Les clés d'API (`tenant_secrets`) ne passent PAS
// par ici : leur cache reste à 60 s (révocation).

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

export const TENANT_GATE_ROW_TTL_MS = 120_000;

export type TenantGateRow = {
  id: string;
  is_active: boolean | null;
  lifecycle_state: string | null;
  lifecycle_reason: string | null;
  purge_after: string | null;
  plan: string | null;
  plan_status: string | null;
  plan_expires_at: string | null;
};

export type TenantGateLookup =
  | { ok: true; row: TenantGateRow | null }
  | { ok: false; error: unknown };

const GATE_COLUMNS =
  'id, is_active, lifecycle_state, lifecycle_reason, purge_after, plan, plan_status, plan_expires_at';

const cache = new Map<string, { row: TenantGateRow; expiresAt: number }>();
const inFlight = new Map<string, Promise<TenantGateLookup>>();

/** Oublie la ligne d'un tenant (ou toutes). Instance courante seulement. */
export function invalidateTenantGateRow(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId);
    inFlight.delete(tenantId);
  } else {
    cache.clear();
    inFlight.clear();
  }
}

async function fetchRow(tenantId: string): Promise<TenantGateLookup> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase_admin_unavailable' };
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(GATE_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    logger.error('[tenants/gateRow] lookup failed', error);
    return { ok: false, error };
  }
  const row = (data as TenantGateRow | null) ?? null;
  if (row) {
    cache.set(tenantId, {
      row,
      expiresAt: Date.now() + TENANT_GATE_ROW_TTL_MS,
    });
  }
  return { ok: true, row };
}

/**
 * La ligne « gate » d'un tenant : servie depuis le cache si fraîche, sinon lue
 * une fois (requête partagée entre appels concurrents).
 */
export async function loadTenantGateRow(
  tenantId: string
): Promise<TenantGateLookup> {
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > Date.now()) return { ok: true, row: hit.row };

  const pending = inFlight.get(tenantId);
  if (pending) return pending;

  const p = fetchRow(tenantId).finally(() => {
    if (inFlight.get(tenantId) === p) inFlight.delete(tenantId);
  });
  inFlight.set(tenantId, p);
  return p;
}
