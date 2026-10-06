// features/admin/users/routes/export.ts — GET /api/admin/users/export
//
// Export CSV des comptes, produit côté serveur avec les MÊMES filtres et le
// même tri que la liste (`search`, `role`, `filters`, `sort`, `dir`). Même
// garde que la liste (permission `manage_staff`, portée plateforme) : qui ne
// voit pas la liste n'en exporte pas le contenu.
//
// Le fichier contient des données personnelles (email, dernière connexion,
// Discord) : chaque export est tracé au journal staff (`export_users`), comme
// celui des équipes (pages/api/admin/teams/export.ts). Une lecture n'a pas de
// slug de journal dans `defineAdminRoute` (seules les mutations en déclarent) :
// l'entrée est donc écrite ici, avant l'envoi du fichier.

import {
  defineAdminRoute,
  read,
  RESPONSE_SENT,
} from '@/utils/admin/defineAdminRoute';
import { logStaffAction } from '@/utils/staffLogs';
import { UsersExportQuery } from '../schemas';
import { collectUsersForExport } from '../service/export';
import { buildUsersCsv, usersExportFilename } from '../usersExport';

export default defineAdminRoute({
  key: 'users-export',
  guard: { permission: 'manage_staff', scope: 'platform' },
  GET: read({
    query: UsersExportQuery,
    // Un export parcourt jusqu'à 50 pages : on n'en laisse pas enchaîner.
    rateLimit: { max: 6, windowMs: 60_000 },
    handler: async ({ query, ctx, res }) => {
      const { items, truncated } = await collectUsersForExport(ctx, query);

      await logStaffAction({
        staff_id: ctx.staff.staff.id,
        action: 'export_users',
        entity_type: 'user',
        entity_id: null,
        tenant_id: ctx.staff.tenantId,
        permission: ctx.staff.permission ?? 'manage_staff',
        payload: {
          kind: 'users_export',
          format: 'csv',
          filters: {
            search: typeof query.search === 'string' ? query.search : null,
            role: typeof query.role === 'string' ? query.role : null,
            filters: typeof query.filters === 'string' ? query.filters : null,
            sort: typeof query.sort === 'string' ? query.sort : null,
            dir: typeof query.dir === 'string' ? query.dir : null,
          },
          count: items.length,
          truncated,
        },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${usersExportFilename()}"`
      );
      res.setHeader('X-Export-Count', String(items.length));
      res.setHeader('X-Export-Truncated', truncated ? '1' : '0');
      res.status(200).send(buildUsersCsv(items));
      return RESPONSE_SENT;
    },
  }),
});
