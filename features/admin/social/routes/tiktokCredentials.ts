// features/admin/social/routes/tiktokCredentials.ts —
// /api/admin/tiktok/credentials : GET (posés ou non, jamais les valeurs), PUT
// (enregistre la paire chiffrée). Auth `manage_communications`.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TiktokCredentialsDoc } from '../schemas';
import { storeTiktokCredentials, tiktokCredentialsState } from '../service';

export default defineAdminRoute({
  key: 'tiktok-credentials',
  guard: { permission: 'manage_communications' },
  GET: read({ handler: ({ ctx }) => tiktokCredentialsState(ctx) }),
  PUT: mutate({
    body: TiktokCredentialsDoc,
    audit: 'store_social_credentials',
    handler: ({ body, ctx }) =>
      audited(ctx, storeTiktokCredentials(ctx, ctx.staff.staff.id, body)),
  }),
});
