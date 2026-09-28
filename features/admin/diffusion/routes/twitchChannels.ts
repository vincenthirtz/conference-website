// features/admin/diffusion/routes/twitchChannels.ts
// GET /api/admin/diffusion/twitch-channels — chaînes actives, lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { listOnAirChannels } from '../service';

export default defineAdminRoute({
  key: 'diffusion-twitch-channels',
  guard: 'caster',
  GET: read({ handler: ({ ctx }) => listOnAirChannels(ctx) }),
});
