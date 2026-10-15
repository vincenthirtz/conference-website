// utils/adminTenants.ts
//
// Helpers partages pour la gestion multi-tenant cote staff (S7).
//
// Trois primitives :
//   - canAccessTenant(staffId, tenantId)
//       Verifie qu'un staff a une row dans `tenant_staff` pour ce tenant.
//   - requireManagerRoleAcrossAnyTenant(staffId)
//       True si le staff a au moins un role `manager+` dans n'importe quel
//       tenant. C'est le critere V1 pour creer/supprimer un tenant ou pour
//       gerer les `pending_guild_links`.
//   - resolveActiveTenant(staffId, cookieTenantId)
//       Resout le tenant actif d'un staff selon l'ordre cookie -> fallback
//       first (premier tenant par slug ASC) -> fallback DEFAULT_TENANT_ID.
//
// Toutes les lectures passent par `supabaseAdmin` (service_role) car les
// tables `tenants` / `tenant_staff` sont restreintes par RLS.
//
// LECTURES EN MÉMOIRE. Ces fonctions tournent à CHAQUE requête admin
// (`requireStaffRoleFromRequest`) : elles lisent deux caches du processus
// plutôt que la base.
//   - utils/staffTenantsCache.ts : les rattachements `tenant_staff` d'un staff
//     (accès, rôle par espace, repli « premier espace ») — 60 s, invalidés par
//     chaque écriture de `tenant_staff` ;
//   - utils/tenantDirectoryCache.ts : l'annuaire des espaces (slug, nom, actif,
//     nature) — 10 min, invalidé par chaque écriture qui le touche.
// Le pourquoi chiffré et les règles de fraîcheur sont dans ces deux fichiers.

import type { StaffRole } from '@/types/admin';
import { supabaseAdmin } from './supabase';
import { DEFAULT_TENANT_ID } from './tenant';
import { logger } from './logger';
import { hasAtLeastRole, STAFF_ROLES } from './staff';
import type { TenantSource } from '@/types/staff';
import { getTenantKind, type TenantKind } from './tenantKind';
import { invalidateStaffTenants, loadStaffTenants } from './staffTenantsCache';
import {
  loadTenantDirectory,
  type TenantDirectoryRow,
} from './tenantDirectoryCache';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTIVE_TENANT_COOKIE = 'staff_active_tenant_id';
export const PROTECTED_TENANT_SLUGS = new Set<string>(['conference']);

export function isValidTenantUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Invalide les rattachements en mémoire (`tenant_staff`) d'un staff, ou de
 * tous. Nom historique : c'était le cache d'accès de `canAccessTenant`, qui lit
 * désormais les rattachements (utils/staffTenantsCache.ts). Le second argument
 * est ignoré — un staff a peu de rattachements, on les oublie tous.
 */
export function invalidateTenantAccessCache(
  staffId?: string,
  _tenantId?: string
): void {
  invalidateStaffTenants(staffId);
}

/** Premier espace par slug ASC (copie triée ; l'entrée n'est pas modifiée). */
function firstBySlug(
  rows: readonly TenantDirectoryRow[]
): TenantDirectoryRow | undefined {
  return [...rows].sort((a, b) =>
    (a.slug ?? '').localeCompare(b.slug ?? '')
  )[0];
}

/**
 * Lit le drapeau `staff.is_pole_admin` d'un staff, quand l'appelant ne l'a pas
 * fourni. Chemin rare (bascule d'espace), volontairement NON mis en cache : un
 * drapeau retiré doit fermer l'accès cross-tenant tout de suite.
 */
async function readPoleAdminFlag(
  staffId: string,
  label: string
): Promise<boolean> {
  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('is_pole_admin')
    .eq('id', staffId)
    .maybeSingle();
  if (staffErr) {
    logger.error(`[adminTenants] ${label} staff lookup error`, staffErr);
    return false;
  }
  return (
    (staffRow as { is_pole_admin?: boolean } | null)?.is_pole_admin === true
  );
}

/**
 * Resultat de la resolution du tenant actif. `source` indique d'ou vient
 * la decision (utile pour debug + UI).
 */
export type ActiveTenantResolution = {
  tenantId: string;
  source: TenantSource;
};

/**
 * Verifie qu'un staff peut acceder a un tenant donne.
 *
 * V1 : "acceder" = avoir une row dans `tenant_staff(tenant_id, staff_id)`.
 * Le `role` colonne n'est pas inspecte (toute row = acces complet).
 *
 * Cross-tenant : si le staff a `is_pole_admin = true` (cf. migration
 * `add_pole_admin_flag_to_staff.sql`), il a acces a tous les tenants sans
 * passer par `tenant_staff`. On accepte un `isPoleAdmin` hint pour eviter
 * un re-SELECT quand l'appelant a deja le staff row charge (typiquement
 * via `requireStaffRoleFromRequest`). Sans hint, on fait un SELECT minimal.
 *
 * Les rattachements sont lus en mémoire (60 s, invalidés à chaque écriture).
 * Une erreur de lecture refuse (fail-closed) sans que le refus soit retenu.
 */
export async function canAccessTenant(
  staffId: string,
  tenantId: string,
  opts?: { isPoleAdmin?: boolean }
): Promise<boolean> {
  if (!isValidTenantUuid(tenantId)) return false;

  // Fast-path : hint deja fourni par l'appelant.
  if (opts?.isPoleAdmin === true) return true;

  if (
    opts?.isPoleAdmin === undefined &&
    (await readPoleAdminFlag(staffId, 'canAccessTenant'))
  ) {
    return true;
  }

  const memberships = await loadStaffTenants(staffId);
  if (!memberships.ok) return false;
  const target = tenantId.toLowerCase();
  return memberships.rows.some((r) => r.tenant_id.toLowerCase() === target);
}

/**
 * Liste les tenants accessibles a un staff.
 *
 * Comportement :
 *   - `is_pole_admin = true` → tous les tenants actifs (cross-tenant).
 *     Le `role` retourne est `'pole_admin'` (informationnel uniquement).
 *   - `is_pole_admin = false` (ou absent) → uniquement les tenants ou il
 *     a une row dans `tenant_staff`. Le `role` retourne est celui de la
 *     row tenant_staff.
 *
 * Comme `canAccessTenant`, accepte un `isPoleAdmin` hint pour eviter un
 * re-SELECT quand l'appelant a deja le staff row.
 */
export type AccessibleTenantRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  role: string;
};

export async function listAccessibleTenants(
  staffId: string,
  opts?: { isPoleAdmin?: boolean }
): Promise<AccessibleTenantRow[]> {
  const isPoleAdmin =
    opts?.isPoleAdmin === undefined
      ? await readPoleAdminFlag(staffId, 'listAccessibleTenants')
      : opts.isPoleAdmin;

  if (isPoleAdmin) {
    const dir = await loadTenantDirectory();
    if (!dir.ok) return [];
    return [...dir.rows]
      .filter((t) => t.is_active === true)
      .sort((a, b) => (a.slug ?? '').localeCompare(b.slug ?? ''))
      .map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name as string,
        is_active: t.is_active as boolean,
        role: 'pole_admin',
      }));
  }

  const memberships = await loadStaffTenants(staffId);
  if (!memberships.ok || memberships.rows.length === 0) return [];

  const dir = await loadTenantDirectory(
    memberships.rows.map((r) => r.tenant_id)
  );
  if (!dir.ok) return [];

  return memberships.rows
    .map((r) => {
      const t = dir.byId.get(r.tenant_id.toLowerCase());
      if (!t) return null;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name as string,
        is_active: t.is_active as boolean,
        role: r.role as string,
      } as AccessibleTenantRow;
    })
    .filter((t): t is AccessibleTenantRow => t !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * V1 : un staff peut creer / supprimer un tenant OU gerer les
 * `pending_guild_links` s'il a au moins le role `manager` (selon le staff
 * global, cf. `staff.role`) dans *au moins* un tenant existant. Comme la
 * colonne `tenant_staff.role` est ignoree en V1, on lit le role global
 * `staff.role` (cf. `requireStaffRoleFromRequest(..., 'manager')`). Cette
 * fonction agit donc surtout comme un sanity check sur la presence d'au
 * moins une row tenant_staff — l'autorisation reelle est portee par
 * `withStaffRoute(handler, 'manager')`.
 */
export async function requireManagerRoleAcrossAnyTenant(
  staffId: string,
  staffRole: StaffRole | null | undefined
): Promise<boolean> {
  if (!hasAtLeastRole(staffRole, 'admin')) return false;
  const memberships = await loadStaffTenants(staffId);
  return memberships.ok && memberships.rows.length > 0;
}

/**
 * Resout le tenant actif d'un staff. Ordre :
 *   1. Cookie present + tenant accessible → 'cookie'.
 *   2. Premier tenant par slug ASC dans tenant_staff → 'fallback_first'.
 *   3. Aucune row tenant_staff → DEFAULT_TENANT_ID, 'fallback_default'
 *      + warning log (cas degrade, ne devrait pas arriver apres backfill).
 *
 * Si `isPoleAdmin` hint est fourni (typiquement par le caller qui a deja
 * charge la row staff), on accepte tout tenant_id valide en cookie et le
 * fallback pioche dans tous les tenants actifs par slug ASC.
 *
 * Le repli (2) est le chemin NOMINAL de quiconque n'a jamais utilisé le
 * sélecteur d'espace (seul à poser le cookie) : il est servi par les deux
 * caches du processus (rattachements + annuaire), sans requête la plupart du
 * temps.
 */
export async function resolveActiveTenant(
  staffId: string,
  cookieTenantId: string | null | undefined,
  opts?: { isPoleAdmin?: boolean }
): Promise<ActiveTenantResolution> {
  const isPoleAdmin = opts?.isPoleAdmin === true;

  // 1) Cookie present + valide → check d'acces.
  if (cookieTenantId && isValidTenantUuid(cookieTenantId)) {
    const lower = cookieTenantId.toLowerCase();
    const allowed = await canAccessTenant(staffId, lower, {
      isPoleAdmin,
    });
    if (allowed) {
      return { tenantId: lower, source: 'cookie' };
    }
  }

  // Pole admin sans cookie valide → premier tenant actif par slug ASC.
  if (isPoleAdmin) {
    const dir = await loadTenantDirectory();
    const first = dir.ok
      ? firstBySlug(dir.rows.filter((t) => t.is_active === true))
      : undefined;
    if (first?.id) {
      return { tenantId: first.id, source: 'fallback_first' };
    }
    // Pas de tenant actif → fallback degrade.
    logger.warn(
      '[adminTenants] pole admin but no active tenant found, falling back to DEFAULT_TENANT_ID',
      { staffId }
    );
    return { tenantId: DEFAULT_TENANT_ID, source: 'fallback_default' };
  }

  // 2) Fallback first : premier tenant par slug ASC dans tenant_staff.
  const memberships = await loadStaffTenants(staffId);
  if (memberships.ok && memberships.rows.length > 0) {
    const tenantIds = memberships.rows.map((r) => r.tenant_id);
    const dir = await loadTenantDirectory(tenantIds);
    if (dir.ok) {
      const first = firstBySlug(
        tenantIds
          .map((id) => dir.byId.get(id.toLowerCase()))
          .filter((t): t is TenantDirectoryRow => t !== undefined)
      );
      if (first?.id) {
        return { tenantId: first.id, source: 'fallback_first' };
      }
      // Tenants table vide mais on a tenant_staff rows → utilise la
      // premiere row brute (cas degrade).
      return { tenantId: tenantIds[0], source: 'fallback_first' };
    }
  }

  // 3) Fallback degrade.
  logger.warn(
    '[adminTenants] staff has no tenant_staff entry, falling back to DEFAULT_TENANT_ID',
    { staffId }
  );
  return { tenantId: DEFAULT_TENANT_ID, source: 'fallback_default' };
}

/**
 * Nature (organizer/developer) d'un espace, lue dans l'annuaire en mémoire —
 * celui qui sert déjà la résolution de l'espace actif : pas de requête de plus
 * par navigation admin. Annuaire illisible → `getTenantKind` (lecture unitaire,
 * fail-safe 'organizer'). Espace inconnu → 'organizer', comme `getTenantKind`.
 */
export async function readTenantKind(tenantId: string): Promise<TenantKind> {
  if (!tenantId) return 'organizer';
  const dir = await loadTenantDirectory([tenantId]);
  if (!dir.ok) return getTenantKind(tenantId);
  return dir.byId.get(tenantId.toLowerCase())?.kind === 'developer'
    ? 'developer'
    : 'organizer';
}

/**
 * Lit le cookie `staff_active_tenant_id` depuis `req.cookies` (parse auto
 * de Next.js). Retourne `null` si absent / malforme.
 */
export function readActiveTenantCookie(
  cookies: Partial<Record<string, string>> | undefined
): string | null {
  if (!cookies) return null;
  const raw = cookies[ACTIVE_TENANT_COOKIE];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return raw.trim();
}

/**
 * Genere la Set-Cookie pour persister le tenant actif. Session cookie
 * (pas de Max-Age) ; `Secure` ajoute hors environnement de dev/test.
 */
export function buildActiveTenantSetCookie(tenantId: string): string {
  const parts = [
    `${ACTIVE_TENANT_COOKIE}=${tenantId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/* ---------------------------------------------------------------------------
 * Rôle d'un staff SUR un tenant donné
 * -------------------------------------------------------------------------*/

/** Purge les rattachements en mémoire (dont les rôles par tenant). Usage test. */
export function __resetTenantRoleCacheForTests(): void {
  invalidateStaffTenants();
}

/**
 * Rôle porté par `tenant_staff` pour ce couple (staff, tenant), ou `null`.
 *
 * Longtemps cette colonne a été ignorée : le back-office se gardait sur le
 * rôle GLOBAL `staff.role`, et `tenant_staff` ne servait qu'à dire « ce staff
 * voit ce tenant ». Conséquence directe : l'onboarding self-service créait un
 * propriétaire de tenant avec `tenant_staff.role = 'owner'` et un rôle global
 * `caster` — c'est-à-dire quelqu'un qui ne pouvait rien administrer chez lui,
 * pas même ouvrir sa page de facturation pour souscrire.
 *
 * La valeur est désormais lue et combinée au rôle global (cf.
 * `requireStaffRoleFromRequest`) : elle ne peut qu'ÉLEVER, jamais rétrograder,
 * et seulement sur le tenant actif. Personne ne perd de droits, un
 * propriétaire de tenant en gagne chez lui.
 *
 * Une valeur inconnue (colonne libre en base) est ignorée plutôt que
 * devinée — un rôle non reconnu n'élève rien. Lue dans les rattachements en
 * mémoire (60 s, invalidés à chaque écriture de `tenant_staff`) ; une erreur
 * de lecture rend `null` sans être retenue.
 */
export async function readTenantStaffRole(
  staffId: string,
  tenantId: string
): Promise<StaffRole | null> {
  if (!staffId || !isValidTenantUuid(tenantId)) return null;

  const memberships = await loadStaffTenants(staffId);
  if (!memberships.ok) return null;

  const target = tenantId.toLowerCase();
  const raw = memberships.rows.find(
    (r) => r.tenant_id.toLowerCase() === target
  )?.role;
  return typeof raw === 'string' &&
    (STAFF_ROLES as readonly string[]).includes(raw)
    ? (raw as StaffRole)
    : null;
}
