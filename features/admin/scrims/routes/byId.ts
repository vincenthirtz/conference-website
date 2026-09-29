// features/admin/scrims/routes/byId.ts — /api/admin/scrims/[scrimId]
// GET : fiche + nombre de matchs ; PATCH / PUT : modification des champs ;
// DELETE : corbeille (soft-delete, restaurable).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ScrimIdQuery, ScrimPatchBody } from '../schemas';
import { deleteScrim, getScrim, updateScrim } from '../service/scrims';

const update = mutate({
  query: ScrimIdQuery,
  body: ScrimPatchBody,
  audit: 'update_scrim',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updateScrim(ctx, query.scrimId, body)),
});

export default defineAdminRoute({
  key: 'admin-scrim-id',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: ScrimIdQuery,
    handler: ({ query, ctx }) => getScrim(ctx, query.scrimId),
  }),
  // PUT est un alias historique de PATCH (même corps, mêmes règles).
  PATCH: update,
  PUT: update,
  DELETE: mutate({
    query: ScrimIdQuery,
    audit: 'delete_scrim',
    handler: ({ query, ctx }) => audited(ctx, deleteScrim(ctx, query.scrimId)),
  }),
});
