// utils/staffTenantsCache.ts
//
// Les rattachements d'un staff aux espaces (`tenant_staff` : espace + rôle),
// gardés en mémoire du processus.
//
// POURQUOI. Chaque appel admin résout l'espace actif du staff. Le cookie
// `staff_active_tenant_id` n'est posé QUE par le sélecteur d'espace (POST
// /api/admin/active-tenant) : un staff qui n'a jamais basculé — un seul
// espace, le sélecteur ne s'affiche même pas —, ou dont la session de
// navigateur a repris (cookie de session), n'en a pas. Chaque requête
// repartait alors du repli « premier espace par slug » : un SELECT
// `tenant_staff`, puis un SELECT `tenants`. S'y ajoutaient le rôle par espace
// (`readTenantStaffRole`) et le contrôle d'accès (`canAccessTenant`), chacun
// sa requête sur la même poignée de lignes : 259 + 91 GET `tenant_staff` en
// 24 h mesurés le 2026-10-15, pour deux staff. Une seule lecture par staff
// sert désormais les quatre.
//
// C'EST UNE DONNÉE D'AUTORISATION : un rattachement retiré doit cesser
// d'ouvrir l'espace.
//   - Toute écriture de `tenant_staff` faite par ce processus invalide
//     aussitôt (repositories admin/tenants et invitations, inscription
//     développeur ; `invalidateStaffCache()` d'utils/staff.ts vide tout).
//   - Le TTL, court (60 s), ne couvre que les écritures faites hors du
//     processus (SQL à la main) — et les copies de ce module côté site
//     (Netlify), qui ne voient pas les écritures de l'API.
//   - Une lecture EN VOL au moment d'une invalidation n'est pas mise en cache
//     (compteur d'époque) : elle a pu lire l'état d'avant l'écriture.
//   - Jamais d'erreur en cache, ni de liste vide : un staff tout juste rattaché
//     doit voir son espace tout de suite.
//
// Module FEUILLE (aucune dépendance vers utils/staff.ts ni
// utils/adminTenants.ts) : `invalidateStaffCache()` doit pouvoir le vider de
// façon SYNCHRONE, alors qu'adminTenants importe staff — l'inverse ne passerait
// que par un `import()` dynamique, donc une invalidation asynchrone.

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { registerProcessCache } from './processCaches';

export const STAFF_TENANTS_TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;

export type StaffTenantMembership = {
  /** Tel que stocké (Postgres rend les uuid en minuscules). */
  tenant_id: string;
  /** `tenant_staff.role` brut ; validé par l'appelant. */
  role: string | null;
};

export type StaffTenantsLookup =
  | { ok: true; rows: readonly StaffTenantMembership[] }
  | { ok: false; error: unknown };

const cache = new Map<
  string,
  { rows: readonly StaffTenantMembership[]; expiresAt: number }
>();
const inFlight = new Map<string, Promise<StaffTenantsLookup>>();
let epoch = 0;

registerProcessCache(() => {
  epoch += 1;
  cache.clear();
  inFlight.clear();
});

/**
 * Oublie les rattachements d'un staff (ou de tous). Instance courante
 * seulement. À appeler APRÈS toute écriture de `tenant_staff`.
 */
export function invalidateStaffTenants(staffId?: string): void {
  epoch += 1;
  if (staffId) {
    cache.delete(staffId);
    inFlight.delete(staffId);
  } else {
    cache.clear();
    inFlight.clear();
  }
}

async function fetchStaffTenants(staffId: string): Promise<StaffTenantsLookup> {
  const startedAt = epoch;
  if (!supabaseAdmin) return { ok: false, error: 'supabase_admin_unavailable' };
  const { data, error } = await supabaseAdmin
    .from('tenant_staff')
    .select('tenant_id, role')
    .eq('staff_id', staffId);
  if (error) {
    logger.error('[staffTenantsCache] tenant_staff lookup failed', error);
    return { ok: false, error };
  }
  const rows: StaffTenantMembership[] = (
    (data as Array<{ tenant_id?: unknown; role?: unknown }> | null) ?? []
  )
    .filter(
      (r): r is { tenant_id: string; role?: unknown } =>
        typeof r.tenant_id === 'string' && r.tenant_id.length > 0
    )
    .map((r) => ({
      tenant_id: r.tenant_id,
      role: typeof r.role === 'string' ? r.role : null,
    }));

  if (rows.length > 0 && startedAt === epoch) {
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(staffId, {
      rows,
      expiresAt: Date.now() + STAFF_TENANTS_TTL_MS,
    });
  }
  return { ok: true, rows };
}

/**
 * Rattachements d'un staff : servis depuis le cache si frais, sinon lus une
 * fois (requête partagée entre appels concurrents).
 */
export async function loadStaffTenants(
  staffId: string
): Promise<StaffTenantsLookup> {
  const hit = cache.get(staffId);
  if (hit && hit.expiresAt > Date.now()) return { ok: true, rows: hit.rows };

  const pending = inFlight.get(staffId);
  if (pending) return pending;

  const p = fetchStaffTenants(staffId).finally(() => {
    if (inFlight.get(staffId) === p) inFlight.delete(staffId);
  });
  inFlight.set(staffId, p);
  return p;
}
