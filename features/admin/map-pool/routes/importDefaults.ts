// features/admin/map-pool/routes/importDefaults.ts —
// POST /api/admin/map-pool/import-defaults : seed du pool d'un jeu depuis le
// catalogue statique (idempotent : les maps déjà présentes sont ignorées).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MapPoolImportDoc } from '../schemas';
import { importDefaultMaps } from '../service';

export default defineAdminRoute({
  key: 'map-pool-import',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    body: MapPoolImportDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'import_default_maps',
    handler: ({ body, ctx }) => audited(ctx, importDefaultMaps(ctx, body)),
  }),
});
