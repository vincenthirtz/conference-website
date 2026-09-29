// features/admin/social/routes/instagramSecret.ts —
// /api/admin/instagram/secret : GET (posé ou non, jamais la valeur), PUT
// (enregistre l'App Secret chiffré). Auth `manage_communications`.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { InstagramSecretDoc } from '../schemas';
import { instagramSecretState, storeInstagramSecret } from '../service';

export default defineAdminRoute({
  key: 'instagram-secret',
  guard: { permission: 'manage_communications' },
  GET: read({ handler: ({ ctx }) => instagramSecretState(ctx) }),
  PUT: mutate({
    body: InstagramSecretDoc,
    audit: 'store_social_credentials',
    handler: ({ body, ctx }) =>
      audited(ctx, storeInstagramSecret(ctx, ctx.staff.staff.id, body)),
  }),
});
