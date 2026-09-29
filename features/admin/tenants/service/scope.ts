// features/admin/tenants/service/scope.ts — ce que les services d'espace
// savent du staff appelant, et les contrôles historiques qu'ils répètent.
//
// La garde de la route (`defineAdminRoute`) reste celle d'origine ; les
// contrôles FINS (owner-only par méthode, « admin+ ou rattaché à CET espace »,
// « espace actif seulement ») vivent ici, à l'identique : mêmes rôles lus
// (effectif ou global), mêmes messages, mêmes codes.

import type { AuthenticatedStaffContext } from '@/types/staff';
import type { StaffRole } from '@/types/admin';
import { LegacyAdminError } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { hasAtLeastRole } from '@/utils/staffRoles';

export type StaffScope = {
  staffId: string;
  /** Rôle EFFECTIF sur l'espace actif (élevé par `tenant_staff.role`). */
  role: StaffRole;
  /** Rôle GLOBAL (`staff.role`). */
  globalRole: StaffRole;
  isPoleAdmin: boolean;
  /** Espace actif du staff. */
  tenantId: string;
};

export function staffScope(staff: AuthenticatedStaffContext): StaffScope {
  return {
    staffId: staff.staff.id,
    role: staff.role,
    globalRole: staff.globalRole,
    isPoleAdmin:
      (staff.staff as { is_pole_admin?: boolean }).is_pole_admin === true,
    tenantId: staff.tenantId,
  };
}

/** `requireOwner(ctx, res)` : rôle EFFECTIF, 403 `{ error: 'Forbidden.' }`. */
export function assertOwner(scope: StaffScope): void {
  if (!hasAtLeastRole(scope.role, 'owner')) {
    throw new LegacyAdminError(403, 'Forbidden.');
  }
}

/**
 * Identifiant de chemin : `typeof string && isValidUUID`, sinon le 400
 * historique de la route (message et, s'il existait, code).
 */
export function requireUuid(
  value: unknown,
  message: string,
  code?: string
): string {
  if (typeof value !== 'string' || !value || !isValidUUID(value)) {
    throw new LegacyAdminError(400, message, code ? { code } : {});
  }
  return value;
}

/**
 * « admin+ (rôle effectif), sinon staff rattaché à CET espace ou pôle-admin » —
 * règle de la fiche d'un espace et de ses vues.
 */
export async function assertAdminOrTenantMember(
  scope: StaffScope,
  tenantId: string
): Promise<void> {
  if (hasAtLeastRole(scope.role, 'admin')) return;
  const allowed = await canAccessTenant(scope.staffId, tenantId, {
    isPoleAdmin: scope.isPoleAdmin,
  });
  if (!allowed) {
    throw new LegacyAdminError(403, 'No access to this tenant.');
  }
}

/** « admin+ (rôle effectif) ET rattaché à CET espace (ou pôle-admin) ». */
export async function assertAdminOfTenant(
  scope: StaffScope,
  tenantId: string
): Promise<void> {
  if (!hasAtLeastRole(scope.role, 'admin')) {
    throw new LegacyAdminError(403, 'Forbidden.');
  }
  const allowed = await canAccessTenant(scope.staffId, tenantId, {
    isPoleAdmin: scope.isPoleAdmin,
  });
  if (!allowed) {
    throw new LegacyAdminError(403, 'No access to this tenant.');
  }
}

/** Espace ACTIF seulement, sauf pôle-admin : 403 `TENANT_SCOPE`. */
export function assertActiveTenant(scope: StaffScope, tenantId: string): void {
  if (tenantId !== scope.tenantId && !scope.isPoleAdmin) {
    throw new LegacyAdminError(403, 'Forbidden.', { code: 'TENANT_SCOPE' });
  }
}

/** Erreur de lecture/écriture : 500 avec le message historique. */
export function serverError(message = 'Server error.'): LegacyAdminError {
  return new LegacyAdminError(500, message);
}
