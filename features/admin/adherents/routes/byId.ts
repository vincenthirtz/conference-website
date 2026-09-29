// features/admin/adherents/routes/byId.ts — /api/admin/adherents/[id]
//   GET    : fiche + historique des paiements
//   PATCH  : mise à jour partielle
//   DELETE : suppression définitive

import {
  defineAdminRoute,
  mutate,
  read,
} from '../../../../utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { AdherentIdQuery, AdherentPatchDoc } from '../schemas';
import { getAdherent, patchAdherent, removeAdherent } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-adherents-id',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_communications', scope: 'platform' },
  GET: read({
    query: AdherentIdQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getAdherent(ctx, query.id),
  }),
  PATCH: mutate({
    query: AdherentIdQuery,
    body: AdherentPatchDoc,
    rateLimit: LIMIT,
    // Ex-`other` + `payload.action: 'update'` (payload conservé).
    audit: 'update_adherent',
    handler: ({ query, body, ctx }) =>
      audited(
        ctx,
        patchAdherent(ctx, query.id, body, ctx.staff.staff.id ?? null)
      ),
  }),
  DELETE: mutate({
    query: AdherentIdQuery,
    rateLimit: LIMIT,
    // Ex-`other` + `payload.action: 'delete'` (payload conservé).
    audit: 'delete_adherent',
    handler: ({ query, ctx }) => audited(ctx, removeAdherent(ctx, query.id)),
  }),
});
