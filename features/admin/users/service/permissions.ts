// features/admin/users/service/permissions.ts — permissions staff accordées
// À L'UNITÉ sur une fiche (GET · PUT /api/admin/users/[userId]/permissions).
//
// Clé = l'id du COMPTE AUTH. On ne peut accorder ou retirer QUE ce qu'on
// détient soi-même (un droit ne se crée pas, il se délègue), on ne juge que ce
// qui CHANGE, et on ne stocke jamais ce que le rôle couvre déjà (sinon le droit
// survivrait à une rétrogradation). Les permissions accordées AJOUTENT, jamais
// ne retirent : « retirer » un droit du rôle, c'est changer de rôle.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  adminErrorFromStatus,
} from '@/utils/admin/errors';
import { STAFF_ROLES, type StaffRole } from '@/utils/staff';
import {
  effectiveStaffPermissions,
  grantableStaffPermissions,
  isStaffPermission,
  staffPermissionsFor,
  type StaffPermission,
} from '@/utils/staffPermissions';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository';

/* ---------------------------------------------------------------------------
 * GET · PUT /api/admin/users/[userId]/permissions
 * ------------------------------------------------------------------------ */

function asRole(value: unknown): StaffRole | null {
  return (STAFF_ROLES as readonly string[]).includes(String(value))
    ? (value as StaffRole)
    : null;
}

export type PermissionsCaller = {
  role: StaffRole;
  extraPermissions: string[] | null | undefined;
};

function requireUserId(raw: unknown): string {
  const userId = String(raw ?? '');
  if (!userId) throw adminErrorFromStatus(400, 'userId requis.');
  return userId;
}

async function loadPermissionTarget(ctx: ServiceContext, userId: string) {
  const { row, error } = await repo.findStaffPermissions(ctx.db, userId);
  if (error) {
    ctx.logger.error('[admin/staff/permissions] failed', error);
    throw new AdminError(500, 'internal', 'Opération impossible.');
  }
  // On ne peut pas accorder une permission STAFF à un non-membre du staff.
  if (!row) throw new NotFoundError('Ce compte n’est pas membre du staff.');
  return row;
}

export async function getStaffPermissions(
  ctx: ServiceContext,
  caller: PermissionsCaller,
  rawUserId: unknown
) {
  const userId = requireUserId(rawUserId);
  const grantable = grantableStaffPermissions(
    caller.role,
    caller.extraPermissions
  );
  const target = await loadPermissionTarget(ctx, userId);
  const targetRole = asRole(target.role);
  return {
    staffId: target.id,
    userId,
    displayName: target.display_name,
    email: target.email,
    role: target.role,
    rolePermissions: staffPermissionsFor(targetRole),
    extraPermissions: target.extra_permissions ?? [],
    effective: effectiveStaffPermissions(targetRole, target.extra_permissions),
    // Ce que l'APPELANT peut cocher ; le reste s'affiche désactivé.
    grantable,
  };
}

export async function setStaffPermissions(
  ctx: ServiceContext,
  caller: PermissionsCaller,
  rawUserId: unknown,
  body: { extraPermissions?: unknown }
): Promise<
  Audited<{ extraPermissions: StaffPermission[]; effective: StaffPermission[] }>
> {
  const userId = requireUserId(rawUserId);
  const grantable = grantableStaffPermissions(
    caller.role,
    caller.extraPermissions
  );
  const target = await loadPermissionTarget(ctx, userId);
  const targetRole = asRole(target.role);

  if (!Array.isArray(body.extraPermissions)) {
    throw adminErrorFromStatus(400, 'extraPermissions doit être un tableau.');
  }
  const requested: StaffPermission[] = [];
  for (const value of body.extraPermissions) {
    if (!isStaffPermission(value)) {
      throw adminErrorFromStatus(400, `Permission inconnue : ${String(value)}`);
    }
    if (!requested.includes(value)) requested.push(value);
  }

  const previous = (target.extra_permissions ?? []).filter(isStaffPermission);
  const added = requested.filter((p) => !previous.includes(p));
  const removed = previous.filter((p) => !requested.includes(p));
  const refused = [...added, ...removed].filter((p) => !grantable.includes(p));
  if (refused.length > 0) {
    throw adminErrorFromStatus(
      403,
      `Vous ne pouvez pas accorder ou retirer un droit que vous n’avez pas : ${refused.join(', ')}.`
    );
  }

  const rolePermissions = staffPermissionsFor(targetRole);
  const stored = requested.filter((p) => !rolePermissions.includes(p));

  const { error } = await repo.setExtraPermissions(ctx.db, target.id, stored);
  if (error) {
    ctx.logger.error('[admin/staff/permissions] failed', error);
    throw new AdminError(500, 'internal', 'Opération impossible.');
  }

  return {
    result: {
      extraPermissions: stored,
      effective: effectiveStaffPermissions(targetRole, stored),
    },
    audit: {
      entity_type: 'staff',
      entity_id: target.id,
      payload: {
        target: target.display_name ?? target.email,
        added,
        removed,
        result: stored,
      },
    },
  };
}
