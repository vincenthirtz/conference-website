// features/admin/diffusion/routes/nextMatch.ts — POST /api/admin/broadcast/next-match
// « Match suivant » en un clic (roadmap #07) : bascule sur le prochain
// segment match et remet l'overlay en scène `starting`.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { goToNextMatch } from '../service';

export default defineAdminRoute({
  key: 'admin-broadcast-next-match',
  guard: { permission: 'manage_broadcast' },
  POST: mutate({
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'broadcast_next_match',
    handler: ({ ctx }) => audited(ctx, goToNextMatch(ctx)),
  }),
});
