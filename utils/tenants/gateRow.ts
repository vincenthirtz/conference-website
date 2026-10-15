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
// 4 326 GET `tenants` en 24 h mesurés. Ici : une seule requête, un seul cache
// (TTL ci-dessous), et les appels concurrents d'une même instance partagent la
// même requête en vol.
//
// CE QUI N'EST PAS MIS EN CACHE :
//   - une erreur de lecture : chaque appelant garde son repli historique
//     (lifecycle → `active`, plan → `discovery`, actif → refus), et la
//     tentative suivante relit ;
//   - une ligne absente : un tenant fraîchement créé doit être vu tout de
//     suite, pas une demi-heure plus tard.
//
// FRAÎCHEUR. Toutes les écritures connues de cette ligne passent par ce
// processus et invalident l'entrée aussitôt (`invalidateTenantGateRow` :
// cycle de vie dans lifecycle.ts, plan dans botPlanGate.ts,
// circuitPartnerGrant.ts et tenantPlanBilling.ts, `is_active` dans
// updateTenantDetail de features/admin/tenants/repository/tenants.ts). Le TTL
// ne couvre donc que les écritures faites hors du processus (SQL à la main).
// Il valait 120 s, toujours voisin de la cadence du bot : ~25 lectures
// `tenants` par heure la nuit pour une ligne qui ne change pas. Puis dix
// minutes : encore 222 GET/jour mesurés pour trois espaces. Trente minutes —
// une demi-heure de retard sur une modification faite à la main en SQL reste
// acceptable. Les clés d'API (`tenant_secrets`) ne passent PAS par ici (cf.
// botAuth.ts).

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { registerProcessCache } from '../processCaches';

export const TENANT_GATE_ROW_TTL_MS = 30 * 60_000;

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
registerProcessCache(() => {
  cache.clear();
  inFlight.clear();
});

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
