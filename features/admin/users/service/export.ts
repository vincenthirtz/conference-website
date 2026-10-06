// features/admin/users/service/export.ts — rassemble TOUS les comptes qui
// correspondent aux filtres de la liste, pour l'export CSV
// (GET /api/admin/users/export).
//
// Même source que la liste (`listUsers` : RPC `admin_list_users` + Discord,
// Battle.net, équipes) : ce que l'écran affiche est exactement ce que le
// fichier contient. Le serveur parcourt les pages lui-même — pas de limite de
// débit à contourner, pas de nouvelle tentative, pas de fichier tronqué sans
// le dire : au-delà de USERS_EXPORT_MAX_ROWS, `truncated` le signale.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { UserLite } from '../manageModel';
import { USERS_EXPORT_MAX_ROWS, USERS_EXPORT_PAGE_SIZE } from '../usersExport';
import { listUsers } from './accounts';

export type UsersExportFilters = {
  search?: unknown;
  role?: unknown;
  sort?: unknown;
  dir?: unknown;
  filters?: unknown;
};

export async function collectUsersForExport(
  ctx: ServiceContext,
  filters: UsersExportFilters,
  opts: { maxRows?: number; pageSize?: number } = {}
): Promise<{ items: UserLite[]; truncated: boolean }> {
  const maxRows = opts.maxRows ?? USERS_EXPORT_MAX_ROWS;
  const pageSize = opts.pageSize ?? USERS_EXPORT_PAGE_SIZE;
  const items: UserLite[] = [];
  // On lit une page de plus que le plafond : c'est elle qui dit s'il y a
  // réellement davantage de comptes (sinon un total pile égal au plafond
  // serait annoncé tronqué).
  for (let offset = 0; items.length <= maxRows; offset += pageSize) {
    const page = await listUsers(ctx, {
      search: filters.search,
      role: filters.role,
      sort: filters.sort,
      dir: filters.dir,
      filters: filters.filters,
      limit: String(pageSize),
      offset: String(offset),
    });
    items.push(...page.items);
    if (page.items.length < pageSize) break;
  }
  const truncated = items.length > maxRows;
  return { items: truncated ? items.slice(0, maxRows) : items, truncated };
}
