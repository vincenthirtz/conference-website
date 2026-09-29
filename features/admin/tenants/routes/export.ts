// features/admin/tenants/routes/export.ts — POST /api/admin/tenants/[id]/export
// Toutes les données d'un espace en une archive JSON (secrets exclus).
//
// Garde de rôle inchangée, PLUS le périmètre : l'espace de l'URL doit être
// un espace dont le staff est membre, ou pôle-admin (assertTenantInScope,
// 403 `TENANT_OUT_OF_SCOPE`).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { IdQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { exportTenant } from '../service/tenants';

export default defineAdminRoute({
  key: 'admin-tenant-export',
  guard: { permission: 'manage_tenant' },
  POST: mutate({
    query: IdQuery,
    rateLimit: { max: 3, windowMs: 300_000 },
    // Jamais en cache d'idempotence : ce serait une COPIE des données de
    // l'espace dans une autre table.
    idempotent: false,
    audit: 'export_tenant',
    handler: async ({ ctx, req, res }) => {
      const { result, audit } = await exportTenant(
        ctx,
        staffScope(ctx.staff),
        req.query.id
      );
      ctx.audit(audit);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="export-${result.slug}-${new Date().toISOString().slice(0, 10)}.json"`
      );
      return result.body;
    },
  }),
});
