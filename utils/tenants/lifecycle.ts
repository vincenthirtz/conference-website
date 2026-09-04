// utils/tenants/lifecycle.ts
//
// L'état d'un espace, et ce qu'il produit.
//
// Avant ce lot, un espace n'avait qu'un booléen `is_active` : « archiver » le
// mettait à false, sans motif, sans auteur, sans date — et surtout sans
// définition partagée des conséquences. Chaque appelant décidait dans son coin
// s'il en tenait compte, ce qui donnait le pire des cas : le bot d'un espace
// archivé continuait de répondre, parce que son authentification ne regardait
// que `tenant_secrets`.
//
// Un seul endroit dit donc ici : quels états existent, ce qu'ils autorisent, et
// quel refus renvoyer. Les appelants n'ont plus qu'à l'appliquer.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

export const LIFECYCLE_STATES = [
  'active',
  'suspended',
  'archived',
  'purge_scheduled',
  'purged',
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Ce que chaque état autorise.
 *
 * `serves` = l'espace répond-il (site, API, bot) ? `writable` = peut-on encore
 * y écrire ? `reversible` = peut-on revenir en arrière ?
 */
export const LIFECYCLE_EFFECTS: Record<
  LifecycleState,
  {
    serves: boolean;
    writable: boolean;
    reversible: boolean;
    httpStatus: number;
  }
> = {
  active: { serves: true, writable: true, reversible: true, httpStatus: 200 },
  // 402 et non 403 : ce n'est pas un droit qui manque, c'est une situation à
  // régler — impayé, abus, demande du client.
  suspended: {
    serves: false,
    writable: false,
    reversible: true,
    httpStatus: 402,
  },
  // 404 : un espace archivé n'existe plus, du point de vue de qui appelle.
  archived: {
    serves: false,
    writable: false,
    reversible: true,
    httpStatus: 404,
  },
  purge_scheduled: {
    serves: false,
    writable: false,
    reversible: true,
    httpStatus: 404,
  },
  purged: {
    serves: false,
    writable: false,
    reversible: false,
    httpStatus: 404,
  },
};

export type TenantLifecycle = {
  state: LifecycleState;
  reason: string | null;
  purgeAfter: string | null;
};

const TTL_MS = 60_000;
const cache = new Map<string, { value: TenantLifecycle; expiresAt: number }>();

/** À usage test, et après un changement d'état. */
export function invalidateLifecycleCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/**
 * L'état d'un espace. Un espace inconnu est traité comme `purged` : ne rien
 * savoir d'un espace et le servir quand même serait le pire des deux mondes.
 *
 * En cas d'erreur de lecture, on répond `active` SANS mettre en cache : une
 * base indisponible ne doit pas couper des espaces en règle. Le risque inverse
 * — servir 60 s de plus un espace suspendu — est le moindre.
 */
export async function getTenantLifecycle(
  tenantId: string
): Promise<TenantLifecycle> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.value;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('lifecycle_state, lifecycle_reason, purge_after')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[lifecycle] lookup failed', error);
    return { state: 'active', reason: null, purgeAfter: null };
  }
  if (!data) {
    return { state: 'purged', reason: null, purgeAfter: null };
  }

  const row = data as {
    lifecycle_state: string | null;
    lifecycle_reason: string | null;
    purge_after: string | null;
  };
  const value: TenantLifecycle = {
    state: (LIFECYCLE_STATES as readonly string[]).includes(
      row.lifecycle_state ?? ''
    )
      ? (row.lifecycle_state as LifecycleState)
      : 'active',
    reason: row.lifecycle_reason ?? null,
    purgeAfter: row.purge_after ?? null,
  };
  cache.set(tenantId, { value, expiresAt: now + TTL_MS });
  return value;
}

/**
 * Le refus à renvoyer, ou `null` si l'espace sert.
 *
 * Le motif est REPRIS dans la réponse quand il existe : un client suspendu qui
 * lit « 402 » sans savoir pourquoi appelle le support, ce qui coûte plus cher
 * que la phrase qu'on aurait pu écrire.
 */
export function lifecycleDenial(
  lifecycle: TenantLifecycle
): { status: number; body: Record<string, unknown> } | null {
  const effects = LIFECYCLE_EFFECTS[lifecycle.state];
  if (effects.serves) return null;
  return {
    status: effects.httpStatus,
    body: {
      error:
        lifecycle.state === 'suspended'
          ? `Espace suspendu.${lifecycle.reason ? ` Motif : ${lifecycle.reason}` : ''}`
          : 'Espace introuvable.',
      code:
        lifecycle.state === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_CLOSED',
      state: lifecycle.state,
    },
  };
}
