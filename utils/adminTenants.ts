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
// Toutes les fonctions utilisent `supabaseAdmin` (service_role) car les
// tables `tenants` / `tenant_staff` sont restreintes par RLS.

import type { StaffRole } from '@/types/admin';
import { supabaseAdmin } from './supabase';
import { DEFAULT_TENANT_ID } from './tenant';
import { logger } from './logger';
import { hasAtLeastRole } from './staff';
import type { TenantSource } from '@/types/staff';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTIVE_TENANT_COOKIE = 'staff_active_tenant_id';
export const PROTECTED_TENANT_SLUGS = new Set<string>(['conference']);

export function isValidTenantUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
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
 */
export async function canAccessTenant(
  staffId: string,
  tenantId: string,
  opts?: { isPoleAdmin?: boolean }
): Promise<boolean> {
  if (!isValidTenantUuid(tenantId)) return false;

  // Fast-path : hint deja fourni par l'appelant.
  if (opts?.isPoleAdmin === true) return true;

  // Si pas de hint, on lit le flag (cheap : staff est cache 5 min dans
  // `getStaffByUserId` mais ici on contourne le cache car on a juste
  // l'id du staff, pas l'auth_user_id).
  if (opts?.isPoleAdmin === undefined) {
    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from('staff')
      .select('is_pole_admin')
      .eq('id', staffId)
      .maybeSingle();
    if (staffErr) {
      logger.error('[adminTenants] canAccessTenant staff lookup error', staffErr);
    } else if ((staffRow as { is_pole_admin?: boolean } | null)?.is_pole_admin) {
      return true;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('tenant_staff')
    .select('staff_id')
    .eq('staff_id', staffId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    logger.error('[adminTenants] canAccessTenant error', error);
    return false;
  }
  return !!data;
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
  let isPoleAdmin = opts?.isPoleAdmin ?? false;

  if (opts?.isPoleAdmin === undefined) {
    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from('staff')
      .select('is_pole_admin')
      .eq('id', staffId)
      .maybeSingle();
    if (staffErr) {
      logger.error(
        '[adminTenants] listAccessibleTenants staff lookup error',
        staffErr
      );
    } else if ((staffRow as { is_pole_admin?: boolean } | null)?.is_pole_admin) {
      isPoleAdmin = true;
    }
  }

  if (isPoleAdmin) {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, is_active')
      .eq('is_active', true)
      .order('slug', { ascending: true });
    if (error) {
      logger.error('[adminTenants] listAccessibleTenants (pole) error', error);
      return [];
    }
    type Row = { id: string; slug: string; name: string; is_active: boolean };
    return ((data as Row[] | null) ?? []).map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      is_active: t.is_active,
      role: 'pole_admin',
    }));
  }

  // Default : lookup via tenant_staff (2 requetes, mock-friendly).
  const { data: rows, error } = await supabaseAdmin
    .from('tenant_staff')
    .select('tenant_id, role')
    .eq('staff_id', staffId);

  if (error) {
    logger.error('[adminTenants] listAccessibleTenants error', error);
    return [];
  }

  type StaffRow = { tenant_id: string; role: string };
  const staffRows = ((rows as StaffRow[] | null) ?? []).filter(
    (r) => typeof r.tenant_id === 'string'
  );
  const ids = staffRows.map((r) => r.tenant_id);
  if (ids.length === 0) return [];

  const { data: tenantsData, error: tErr } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, is_active')
    .in('id', ids);
  if (tErr) {
    logger.error(
      '[adminTenants] listAccessibleTenants tenants lookup error',
      tErr
    );
    return [];
  }
  type TRow = { id: string; slug: string; name: string; is_active: boolean };
  const tenantsById = new Map<string, TRow>(
    ((tenantsData as TRow[] | null) ?? []).map((t) => [t.id, t])
  );

  return staffRows
    .map((r) => {
      const t = tenantsById.get(r.tenant_id);
      if (!t) return null;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        is_active: t.is_active,
        role: r.role,
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
  if (!hasAtLeastRole(staffRole, 'manager')) return false;
  const { data, error } = await supabaseAdmin
    .from('tenant_staff')
    .select('tenant_id')
    .eq('staff_id', staffId)
    .limit(1);
  if (error) {
    logger.error(
      '[adminTenants] requireManagerRoleAcrossAnyTenant error',
      error
    );
    return false;
  }
  return Array.isArray(data) && data.length > 0;
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
 * Note perf : `tenant_staff` est minuscule (< 100 rows attendus), une
 * requete par appel est negligeable. Pas de cache V1.
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
    const { data: tenantsData, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug')
      .eq('is_active', true)
      .order('slug', { ascending: true });
    if (!tErr && Array.isArray(tenantsData) && tenantsData.length > 0) {
      const sorted = (tenantsData as Array<{ id: string; slug: string }>).sort(
        (a, b) => (a.slug ?? '').localeCompare(b.slug ?? '')
      );
      const first = sorted[0];
      if (first?.id) {
        return { tenantId: first.id, source: 'fallback_first' };
      }
    }
    // Pas de tenant actif → fallback degrade.
    logger.warn(
      '[adminTenants] pole admin but no active tenant found, falling back to DEFAULT_TENANT_ID',
      { staffId }
    );
    return { tenantId: DEFAULT_TENANT_ID, source: 'fallback_default' };
  }

  // 2) Fallback first : premier tenant par slug ASC dans tenant_staff.
  // On fait 2 requetes pour rester compatible avec les mocks de test (pas
  // d'embed PostgREST) : (a) lister les tenant_id, puis (b) lire les
  // slugs depuis `tenants` pour les trier.
  const { data: rows, error } = await supabaseAdmin
    .from('tenant_staff')
    .select('tenant_id')
    .eq('staff_id', staffId);

  if (error) {
    logger.error(
      '[adminTenants] resolveActiveTenant fallback_first error',
      error
    );
  } else if (Array.isArray(rows) && rows.length > 0) {
    const tenantIds = (rows as Array<{ tenant_id: string }>)
      .map((r) => r.tenant_id)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

    if (tenantIds.length > 0) {
      const { data: tenantsData, error: tErr } = await supabaseAdmin
        .from('tenants')
        .select('id, slug')
        .in('id', tenantIds);
      if (tErr) {
        logger.error(
          '[adminTenants] resolveActiveTenant tenants lookup error',
          tErr
        );
      } else {
        const sorted = (
          (tenantsData as Array<{ id: string; slug: string }>) ?? []
        )
          .filter((t) => tenantIds.includes(t.id))
          .sort((a, b) => (a.slug ?? '').localeCompare(b.slug ?? ''));
        const first = sorted[0];
        if (first?.id) {
          return { tenantId: first.id, source: 'fallback_first' };
        }
        // Tenants table vide mais on a tenant_staff rows → utilise la
        // premiere row brute (cas degrade).
        return { tenantId: tenantIds[0], source: 'fallback_first' };
      }
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
