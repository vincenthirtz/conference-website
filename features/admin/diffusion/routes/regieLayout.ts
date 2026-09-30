// features/admin/diffusion/routes/regieLayout.ts —
// GET/PUT /api/admin/diffusion/regie-layout : où la source OBS `/overlay/regie`
// pose chaque élément (alertes, sondage MVP, partenaires, QR de don).
//   - GET : la régie (casteuses comprises) ;
//   - PUT : `manage_broadcast`, comme les réglages de la boîte d'alertes.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { RegieLayoutBody } from '../schemas';
import { readRegieLayout, saveRegieLayout } from '../service/regieLayout';

export default defineAdminRoute({
  key: 'diffusion-regie-layout',
  guard: 'caster',
  GET: read({
    handler: ({ ctx }) => readRegieLayout(ctx),
  }),
  PUT: mutate({
    guard: { permission: 'manage_broadcast' },
    body: RegieLayoutBody,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'update_regie_layout',
    handler: ({ body, ctx }) => audited(ctx, saveRegieLayout(ctx, body)),
  }),
});
