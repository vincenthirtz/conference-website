// features/admin/twitch/routes/marker.ts — POST /api/admin/twitch/marker
// Stream marker sur le live en cours (scope channel:manage:broadcast ;
// 409 NOT_LIVE hors live).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MarkerDoc } from '../schemas';
import { createMarker } from '../service/actions';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-marker',
  guard: TWITCH_GUARD,
  POST: mutate({
    body: MarkerDoc,
    rateLimit: PER_MIN_30,
    audit: 'create_twitch_marker',
    handler: ({ ctx, req }) => audited(ctx, createMarker(ctx, req.body)),
  }),
});
