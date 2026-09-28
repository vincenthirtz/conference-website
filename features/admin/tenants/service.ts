// features/admin/tenants/service.ts

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import {
  listAccessibleTenants,
  type AccessibleTenantRow,
} from '@/utils/adminTenants';
import * as repo from './repository';

/**
 * Espaces accessibles au staff (switcher de tenant) :
 *   - staff « normal » : ceux où il a une row `tenant_staff` ;
 *   - `is_pole_admin` : tous les espaces actifs (rôle exposé `pole_admin`).
 */
export async function listTenantsForStaff(
  staffId: string,
  isPoleAdmin: boolean
): Promise<{ tenants: AccessibleTenantRow[] }> {
  return { tenants: await listAccessibleTenants(staffId, { isPoleAdmin }) };
}

export async function listPendingGuildLinks(ctx: ServiceContext) {
  const { rows, error } = await repo.listPendingGuildLinks(ctx.db);
  if (error) {
    ctx.logger.error('[admin/pending-guild-links] list error', error);
    throw new AdminError(
      500,
      'internal',
      'Failed to load pending guild links.'
    );
  }
  return { links: rows };
}
