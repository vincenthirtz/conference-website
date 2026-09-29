// features/admin/tenants/service/staffFlags.ts — bascule du drapeau
// `staff.is_pole_admin` (accès à TOUS les espaces).
//
// Qui : la route exige l'owner GLOBAL. On ne se modifie pas soi-même, sauf à
// être déjà pôle-admin (pour se retirer le drapeau) — un owner global qui ne
// l'est pas ne s'auto-promeut pas.
//
// Garde-fou : on ne retire pas le drapeau au dernier owner actif pole_admin
// (`LAST_POLE_OWNER`) — sinon plus personne n'administre la plateforme.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import { invalidateStaffCache } from '@/utils/staff';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/staffFlags';
import type { StaffScope } from './scope';

type PoleAdminResult = {
  staff_id: string;
  is_pole_admin: boolean;
  changed: boolean;
};

export async function togglePoleAdmin(
  ctx: ServiceContext,
  caller: StaffScope,
  staffId: string | undefined,
  desired: boolean
): Promise<Audited<PoleAdminResult>> {
  if (!staffId) {
    throw new LegacyAdminError(400, 'Invalid staff id.', {
      code: 'INVALID_STAFF_ID',
    });
  }
  // Avant toute lecture : se modifier soi-même n'est permis qu'au pôle-admin.
  if (staffId === caller.staffId && !caller.isPoleAdmin) {
    throw new LegacyAdminError(403, 'Forbidden.', {
      code: 'SELF_POLE_ADMIN',
    });
  }

  const { row: target, error: targetErr } = await repo.findStaffForPoleAdmin(
    ctx.db,
    staffId
  );
  if (targetErr) {
    ctx.logger.error('[admin/staff/pole-admin] target lookup error', targetErr);
    throw new LegacyAdminError(500, 'Server error.');
  }
  if (!target) {
    throw new LegacyAdminError(404, 'Staff not found.', {
      code: 'STAFF_NOT_FOUND',
    });
  }

  // Déjà dans l'état demandé : 200 sans rejouer le journal.
  if (Boolean(target.is_pole_admin) === desired) {
    return {
      result: { staff_id: target.id, is_pole_admin: desired, changed: false },
      audit: { skip: true },
    };
  }

  if (!desired && target.role === 'owner' && target.is_pole_admin) {
    const { rows, error: ownersErr } = await repo.listPoleAdminOwners(ctx.db);
    if (ownersErr) {
      ctx.logger.error(
        '[admin/staff/pole-admin] owners lookup error',
        ownersErr
      );
      throw new LegacyAdminError(500, 'Server error.');
    }
    const activeOtherPoleOwners = rows.filter(
      (s) =>
        s.id !== target.id &&
        s.is_active !== false &&
        !s.deleted_at &&
        s.is_pole_admin === true &&
        s.role === 'owner'
    );
    if (activeOtherPoleOwners.length === 0) {
      throw new LegacyAdminError(
        409,
        'Cannot remove pole_admin from the last active owner — at least one active owner must remain pole_admin to avoid a cross-tenant lockout.',
        { code: 'LAST_POLE_OWNER' }
      );
    }
  }

  const { error: updateErr } = await repo.setPoleAdmin(
    ctx.db,
    target.id,
    desired
  );
  if (updateErr) {
    ctx.logger.error('[admin/staff/pole-admin] update error', updateErr, {
      staffId: target.id,
    });
    throw new LegacyAdminError(500, 'Failed to update pole_admin flag.');
  }

  // Le drapeau est relu via getStaffByUserId au prochain appel de la cible.
  invalidateStaffCache(target.auth_user_id ?? undefined);

  return {
    result: { staff_id: target.id, is_pole_admin: desired, changed: true },
    audit: {
      entity_type: 'staff',
      entity_id: target.id,
      payload: {
        action: 'toggle_pole_admin',
        value: desired,
        targetStaffId: target.id,
      },
    },
  };
}
