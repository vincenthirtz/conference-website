// features/admin/moderation/routes/commentSettings.ts —
// /api/admin/moderation/comments/settings
//   GET   : mode de modération du tenant + articles aux commentaires fermés ;
//   PUT   : active / désactive la pré-modération ;
//   PATCH : ferme / rouvre les commentaires d'un article.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  getCommentSettings,
  setArticleCommentsClosed,
  updateCommentSettings,
} from '../commentModeration';
import { CommentArticleClosureBody, CommentSettingsBody } from '../schemas';

export default defineAdminRoute({
  key: 'admin-moderation-comment-settings',
  guard: { permission: 'moderate_support' },
  GET: read({
    handler: ({ ctx }) => getCommentSettings(ctx),
  }),
  PUT: mutate({
    body: CommentSettingsBody,
    audit: 'update_comment_settings',
    handler: ({ body, ctx }) => audited(ctx, updateCommentSettings(ctx, body)),
  }),
  PATCH: mutate({
    body: CommentArticleClosureBody,
    audit: 'update_comment_settings',
    handler: ({ body, ctx }) =>
      audited(ctx, setArticleCommentsClosed(ctx, body)),
  }),
});
