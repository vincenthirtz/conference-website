// utils/tenantKind.ts
//
// Helper autour de la colonne `tenants.kind` (migration :
// `tenants.kind text NOT NULL DEFAULT 'organizer' CHECK (kind IN
// ('organizer','developer'))`).
//
// Deux natures de tenant :
//   - 'organizer'  : tenant classique (organisateur de tournois). Défaut.
//   - 'developer'  : compte « espace développeur » — un owner confiné à SON
//                    tenant, qui ne doit pas pouvoir créer d'autres tenants
//                    organisateurs (cf. garde dans /api/admin/tenants).
//
// Fail-safe : si la lecture échoue OU si la colonne n'existe pas encore
// (déploiement où la migration n'est pas passée : codes 42703 / PGRST204),
// on retourne 'organizer' pour ne jamais durcir accidentellement l'accès des
// tenants existants.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type TenantKind = 'organizer' | 'developer';

/* -----------------------------------------------------------
 * Cache mémoire module-level (TTL 5 min).
 *
 * `tenants.kind` est quasi immuable (fixé à la création, ne change qu'à la
 * conversion explicite d'un tenant). `getTenantKind` est appelé à CHAQUE
 * navigation admin (via withStaffPage) : sans cache, c'est une requête
 * `tenants` par navigation. On mémoïse le résultat par tenantId.
 *
 * Même esprit que `staffCache` dans utils/staff.ts (Map + timestamp +
 * éviction simple). On ne cache QUE les lectures réussies : une erreur
 * transitoire ne doit pas figer le fail-safe 'organizer' pendant 5 min.
 * ---------------------------------------------------------*/

const TENANT_KIND_CACHE_TTL = 5 * 60 * 1_000; // 5 minutes
const tenantKindCache = new Map<
  string,
  { kind: TenantKind; expiresAt: number }
>();

/**
 * Lit `tenants.kind` pour un tenant donné.
 *
 * Retourne 'organizer' par défaut/fallback :
 *   - tenant introuvable,
 *   - erreur de lecture,
 *   - colonne absente (42703 / PGRST204),
 *   - valeur inattendue.
 */
export async function getTenantKind(tenantId: string): Promise<TenantKind> {
  if (!tenantId || !supabaseAdmin) return 'organizer';

  const now = Date.now();
  const cached = tenantKindCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.kind;
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('kind')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    // Colonne absente (migration non appliquée) → fail-safe silencieux.
    if (code !== '42703' && code !== 'PGRST204') {
      logger.error('[tenantKind] getTenantKind error', error);
    }
    // On ne cache pas les erreurs (fail-open non figé).
    return 'organizer';
  }

  const kind = (data as { kind?: unknown } | null)?.kind;
  const resolved: TenantKind = kind === 'developer' ? 'developer' : 'organizer';
  tenantKindCache.set(tenantId, {
    kind: resolved,
    expiresAt: now + TENANT_KIND_CACHE_TTL,
  });
  return resolved;
}

/**
 * Invalide le cache de `getTenantKind`. Sans argument : purge totale.
 * À appeler lors d'une conversion de tenant (organizer ↔ developer) pour
 * refléter le changement immédiatement. Optionnel — le TTL 5 min finit par
 * rattraper toute divergence.
 */
export function invalidateTenantKind(tenantId?: string): void {
  if (tenantId) {
    tenantKindCache.delete(tenantId);
  } else {
    tenantKindCache.clear();
  }
}

/**
 * True si le tenant est un tenant organisateur (kind==='organizer').
 *
 * Ne renvoie PAS de réponse HTTP : l'appelant décide du garde (403…).
 */
export async function assertOrganizerTenant(
  tenantId: string
): Promise<boolean> {
  return (await getTenantKind(tenantId)) === 'organizer';
}
