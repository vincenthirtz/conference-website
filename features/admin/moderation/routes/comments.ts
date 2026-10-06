// features/admin/moderation/routes/comments.ts — /api/admin/moderation/comments
//   GET  : file de modération des commentaires (filtre `status`, recherche,
//          article) + nombre en attente ;
//   POST : action en masse sur une sélection (`show` | `hide` | `delete`).
// L'édition unitaire reste sur /api/admin/comments.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import {
  bulkModerateComments,
  listModeratedComments,
} from '../commentModeration';
import { CommentBulkBody, CommentModerationListQuery } from '../schemas';

export default defineAdminRoute({
  key: 'admin-moderation-comments',
  guard: { permission: 'moderate_support' },
  GET: read({
    query: CommentModerationListQuery,
    handler: ({ query, ctx, req }) =>
      listModeratedComments(
        ctx,
        query,
        parsePagination(req, { limit: 30, maxLimit: 100 })
      ),
  }),
  POST: mutate({
    body: CommentBulkBody,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'moderate_comments',
    handler: ({ body, ctx }) => audited(ctx, bulkModerateComments(ctx, body)),
  }),
});
