// features/admin/tcg/routes/fanart.ts — /api/admin/tcg/fanart
// GET la file des fan arts (`?status=`), PATCH valider (rareté) / refuser /
// retirer (écriture conditionnée au statut de départ).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TcgFanartDecisionDoc, TcgFanartListQuery } from '../schemas';
import { decideFanart, listFanart } from '../service/moderation';

export default defineAdminRoute({
  key: 'tcg-fanart',
  guard: { permission: 'manage_tcg' },
  GET: read({
    query: TcgFanartListQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ query, ctx }) => listFanart(ctx, query.status),
  }),
  PATCH: mutate({
    body: TcgFanartDecisionDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    // Slug de la méthode ; refus / retrait précisés par le service.
    audit: 'approve_tcg_fanart',
    handler: ({ body, ctx }) =>
      audited(ctx, decideFanart(ctx, ctx.staff.staff.id, body)),
  }),
});
