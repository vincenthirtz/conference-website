// features/admin/communications/routes/campaignWave.ts — POST /api/admin/broadcast/[campaignId]/wave
// Déclenche la prochaine vague sans attendre le cron. Idempotence
// (`Idempotency-Key`) : un double-clic n'envoie pas deux vagues.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CampaignIdQuery } from '../schemas';
import { campaignIdOf, sendNextWave } from '../service';

export default defineAdminRoute({
  key: 'broadcast-wave',
  guard: { permission: 'manage_broadcast', scope: 'platform' },
  POST: mutate({
    query: CampaignIdQuery,
    audit: 'broadcast_wave_send',
    handler: ({ query, ctx }) =>
      audited(ctx, sendNextWave(ctx, campaignIdOf(query.campaignId))),
  }),
});
