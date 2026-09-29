// features/admin/social/routes/blueskyCredentials.ts
// /api/admin/bluesky/credentials — GET dit si le compte est configuré (jamais
// le mot de passe) ; PUT enregistre handle + mot de passe d'application.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { BlueskyCredentialsDoc } from '../schemas';
import { getBlueskyAccount, storeBlueskyCredentials } from '../service/bluesky';

export default defineAdminRoute({
  key: 'bluesky-credentials',
  guard: { permission: 'manage_communications' },
  GET: read({ handler: ({ ctx }) => getBlueskyAccount(ctx) }),
  PUT: mutate({
    body: BlueskyCredentialsDoc,
    audit: 'store_social_credentials',
    handler: ({ body, ctx }) =>
      audited(
        ctx,
        storeBlueskyCredentials(ctx, body, ctx.staff.staff.id ?? null)
      ),
  }),
});
