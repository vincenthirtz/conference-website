// features/admin/twitch/routes/clip.ts — POST /api/admin/twitch/clip
// Clip des ~30 dernières secondes (scope clips:edit).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { createClip } from '../service/actions';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-clip',
  guard: TWITCH_GUARD,
  POST: mutate({
    rateLimit: PER_MIN_30,
    audit: 'create_twitch_clip',
    handler: ({ ctx }) => audited(ctx, createClip(ctx)),
  }),
});
