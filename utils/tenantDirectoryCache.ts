// utils/tenantDirectoryCache.ts
//
// L'annuaire des espaces — id, slug, nom, actif, nature — lu d'un bloc et
// gardé en mémoire du processus.
//
// POURQUOI. Résoudre l'espace actif d'un staff sans cookie (cf.
// utils/staffTenantsCache.ts) demandait les slugs de ses espaces pour prendre
// le premier : un SELECT `tenants` par requête admin. Pour un pôle-admin, c'était
// la LISTE de tous les espaces actifs, à chaque requête : 447 + 277 GET
// `tenants` en 24 h mesurés le 2026-10-15. La table compte quelques dizaines
// de lignes et ne change qu'à la création, au renommage ou à la fermeture d'un
// espace : une lecture la sert entière, pour tous les staff.
//
// CE QUE L'ANNUAIRE DÉCIDE — et ce qu'il ne décide pas. Il dit quel espace
// ouvrir PAR DÉFAUT et comment l'afficher (slug, nom, nature). Il n'ouvre
// aucun accès : l'accès vient des rattachements (`tenant_staff`, 60 s, cf.
// staffTenantsCache.ts) ou du drapeau pôle-admin de la fiche staff. D'où un
// TTL plus long (10 min) que celui des données d'autorisation.
//
// FRAÎCHEUR.
//   - Les écritures de `tenants` qui touchent ces colonnes, faites par ce
//     processus, invalident aussitôt (repositories admin/tenants, inscription
//     développeur).
//   - Un id inconnu de l'annuaire (espace créé hors du processus, ou par un
//     chemin non instrumenté) déclenche une relecture immédiate : un espace
//     tout neuf est vu tout de suite.
//   - Une lecture en vol au moment d'une invalidation n'est pas mise en cache.
//   - Jamais d'erreur en cache, ni d'annuaire vide.

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { registerProcessCache } from './processCaches';

export const TENANT_DIRECTORY_TTL_MS = 10 * 60_000;

export type TenantDirectoryRow = {
  id: string;
  slug: string;
  name: string | null;
  is_active: boolean | null;
  /** `organizer` | `developer` (cf. utils/tenantKind.ts). */
  kind: string | null;
};

export type TenantDirectoryLookup =
  | {
      ok: true;
      rows: readonly TenantDirectoryRow[];
      /** Clé : id en minuscules. */
      byId: ReadonlyMap<string, TenantDirectoryRow>;
    }
  | { ok: false; error: unknown };

type Entry = {
  rows: readonly TenantDirectoryRow[];
  byId: ReadonlyMap<string, TenantDirectoryRow>;
  expiresAt: number;
};

let entry: Entry | null = null;
let inFlight: Promise<TenantDirectoryLookup> | null = null;
let epoch = 0;

registerProcessCache(() => {
  epoch += 1;
  entry = null;
  inFlight = null;
});

/** Oublie l'annuaire. Instance courante seulement. */
export function invalidateTenantDirectory(): void {
  epoch += 1;
  entry = null;
  inFlight = null;
}

async function fetchDirectory(): Promise<TenantDirectoryLookup> {
  const startedAt = epoch;
  if (!supabaseAdmin) return { ok: false, error: 'supabase_admin_unavailable' };
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, is_active, kind');
  if (error) {
    logger.error('[tenantDirectoryCache] tenants lookup failed', error);
    return { ok: false, error };
  }
  // Valeurs rendues telles que lues (mêmes formes que les requêtes qu'il
  // remplace) ; seul le slug est ramené à '' s'il manquait, pour le tri.
  const rows: TenantDirectoryRow[] = (
    (data as Array<Record<string, unknown>> | null) ?? []
  )
    .filter((r) => typeof r.id === 'string' && r.id.length > 0)
    .map((r) => ({
      id: r.id as string,
      slug: typeof r.slug === 'string' ? r.slug : '',
      name: r.name as string | null,
      is_active: r.is_active as boolean | null,
      kind: r.kind as string | null,
    }));
  const byId = new Map(rows.map((r) => [r.id.toLowerCase(), r]));

  if (rows.length > 0 && startedAt === epoch) {
    entry = {
      rows,
      byId,
      expiresAt: Date.now() + TENANT_DIRECTORY_TTL_MS,
    };
  }
  return { ok: true, rows, byId };
}

/**
 * L'annuaire, depuis le cache s'il est frais ET connaît chacun des
 * `requiredIds` ; sinon relu une fois (requête partagée entre appels
 * concurrents). Un id qui reste inconnu après relecture n'existe pas.
 */
export async function loadTenantDirectory(
  requiredIds: readonly string[] = []
): Promise<TenantDirectoryLookup> {
  const hit = entry;
  if (
    hit &&
    hit.expiresAt > Date.now() &&
    requiredIds.every((id) => hit.byId.has(id.toLowerCase()))
  ) {
    return { ok: true, rows: hit.rows, byId: hit.byId };
  }

  if (inFlight) return inFlight;
  const p = fetchDirectory().finally(() => {
    if (inFlight === p) inFlight = null;
  });
  inFlight = p;
  return p;
}
