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
    return 'organizer';
  }

  const kind = (data as { kind?: unknown } | null)?.kind;
  return kind === 'developer' ? 'developer' : 'organizer';
}

/**
 * True si le tenant est un tenant organisateur (kind==='organizer').
 *
 * Ne renvoie PAS de réponse HTTP : l'appelant décide du garde (403…).
 */
export async function assertOrganizerTenant(tenantId: string): Promise<boolean> {
  return (await getTenantKind(tenantId)) === 'organizer';
}
