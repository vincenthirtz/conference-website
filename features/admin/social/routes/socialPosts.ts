// features/admin/social/routes/socialPosts.ts — /api/admin/social-posts
//   GET  : destinations, connexions, historique des envois, tags connus
//   POST : aperçu (`dryRun`, défaut) ou publication multi-destinations
//
// L'idempotence (par défaut) n'est pas un confort ici : une annonce postée
// deux fois se voit, et se supprime à la main sur deux surfaces.

import {
  RESPONSE_SENT,
  defineAdminRoute,
  mutate,
  read,
} from '@/utils/admin/defineAdminRoute';
import { logger } from '@/utils/logger';
import { SocialPostDoc, SocialPostListQuery } from '../schemas';
import { composeSocialPost, listSocialPosts } from '../service/posts';

export default defineAdminRoute({
  key: 'social-posts',
  guard: { permission: 'manage_communications' },
  GET: read({
    query: SocialPostListQuery,
    handler: ({ query, ctx }) => listSocialPosts(ctx, query),
  }),
  POST: mutate({
    body: SocialPostDoc,
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: 'publish_social_post',
    // Corps BRUT : le 400 garde sa forme historique (`details`).
    handler: async ({ ctx, req, res }) => {
      const out = await composeSocialPost(
        ctx,
        req.body,
        ctx.staff.staff.id ?? null
      );
      if (out.kind === 'preview') {
        // Un aperçu ne publie rien : rien à journaliser.
        ctx.audit({ skip: true });
        return out.body;
      }
      // ISR : best-effort, une revalidation ratée ne fait pas échouer une
      // publication déjà partie.
      await Promise.all(
        out.revalidate.map((path) =>
          res.revalidate(path).catch((err) => {
            logger.error(`[admin/social-posts] revalidate ${path} failed`, err);
          })
        )
      );
      ctx.audit(out.audit);
      res.status(201).json(out.body);
      return RESPONSE_SENT;
    },
  }),
});
