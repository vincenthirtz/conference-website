// features/admin/news/routes/comments.ts — /api/admin/comments
//   GET    : commentaires des actualités (paginés, recherche, filtre article)
//   PATCH  : corrige contenu / auteur (`id` dans le corps)
//   DELETE : supprime (`id` dans le corps)

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import {
  CommentDeleteDoc,
  CommentListQuery,
  CommentPatchDoc,
} from '../schemas';
import { deleteComment, listComments, updateComment } from '../service';

export default defineAdminRoute({
  key: 'admin-comments',
  guard: { permission: 'moderate_support' },
  GET: read({
    query: CommentListQuery,
    handler: ({ query, ctx, req }) =>
      listComments(
        ctx,
        query,
        parsePagination(req, { limit: 50, maxLimit: 200 })
      ),
  }),
  PATCH: mutate({
    body: CommentPatchDoc,
    audit: 'update_comment',
    handler: ({ body, ctx }) => audited(ctx, updateComment(ctx, body)),
  }),
  DELETE: mutate({
    body: CommentDeleteDoc,
    audit: 'delete_comment',
    handler: ({ body, ctx }) => audited(ctx, deleteComment(ctx, body)),
  }),
});
