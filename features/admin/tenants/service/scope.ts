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

export const TENANT_OUT_OF_SCOPE =
  'Cet espace ne fait pas partie de votre périmètre.';

/**
 * RÈGLE UNIQUE des routes qui agissent sur un espace DÉSIGNÉ PAR L'URL
 * (`tenants/[id]/*`) : membre de l'espace (`tenant_staff`) ou pôle-admin.
 * Aucune exception par rôle — ni owner global, ni admin : un rôle dit ce
 * qu'on peut faire, pas OÙ. Sans cette règle, le propriétaire de l'espace A
 * (élevé owner chez lui par `tenant_staff`) visait l'espace B par son id :
 * rotation des secrets du bot, ajout de soi en owner, export, fermeture.
 *
 * À appeler AVANT toute lecture/écriture de l'espace ; les contrôles de rôle
 * (owner/admin effectif) s'ajoutent, ils ne remplacent pas celui-ci.
 */
export async function assertTenantInScope(
  scope: StaffScope,
  tenantId: string
): Promise<void> {
  const allowed = await canAccessTenant(scope.staffId, tenantId, {
    isPoleAdmin: scope.isPoleAdmin,
  });
  if (!allowed) {
    throw new LegacyAdminError(403, TENANT_OUT_OF_SCOPE, {
      code: 'TENANT_OUT_OF_SCOPE',
    });
  }
}

/** « admin+ (rôle effectif) » ET espace dans le périmètre. */
export async function assertAdminOfTenant(
  scope: StaffScope,
  tenantId: string
): Promise<void> {
  if (!hasAtLeastRole(scope.role, 'admin')) {
    throw new LegacyAdminError(403, 'Forbidden.');
  }
  await assertTenantInScope(scope, tenantId);
}

/**
 * Privilège de PLATEFORME : pôle-admin ou owner GLOBAL (`staff.role`). Un
 * owner EFFECTIF (élevé par `tenant_staff`, compte développeur compris) ne
 * l'est pas — sans quoi chaque propriétaire d'espace s'offrirait un droit qui
 * dépasse son espace (clé partenaire gratuite, drapeau pôle-admin…).
 */
export function isPlatformOwner(scope: StaffScope): boolean {
  return scope.isPoleAdmin || scope.globalRole === 'owner';
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
