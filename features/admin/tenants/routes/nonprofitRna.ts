// features/admin/tenants/routes/nonprofitRna.ts — /api/admin/tenants/[id]/nonprofit-rna
//   PUT    : déclarer le RNA (Découverte offerte si association vérifiée).
//   DELETE : le retirer (et la gratuité qu'il portait seulement).
// Espace actif seulement, sauf pôle-admin.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, NonprofitRnaDoc } from '../schemas';
import { staffScope } from '../service/scope';
import { declareRna, removeRna } from '../service/settings';

export type { NonprofitRnaResponse } from '../service/settings';

export default defineAdminRoute({
  key: 'tenant-nonprofit-rna',
  guard: { permission: 'manage_settings' },
  PUT: mutate({
    query: IdQuery,
    body: NonprofitRnaDoc,
    audit: 'settings_update',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        declareRna(ctx, staffScope(ctx.staff), req.query.id, req.body)
      ),
  }),
  DELETE: mutate({
    query: IdQuery,
    audit: 'settings_update',
    handler: ({ ctx, req }) =>
      audited(ctx, removeRna(ctx, staffScope(ctx.staff), req.query.id)),
  }),
});
