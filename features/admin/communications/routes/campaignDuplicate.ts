// features/admin/communications/routes/campaignDuplicate.ts — POST /api/admin/broadcast/[campaignId]/duplicate
// Copie en `draft` (201 { campaign: { id } }), aucun email envoyé.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CampaignIdQuery } from '../schemas';
import { campaignIdOf, duplicateCampaign } from '../service';

export default defineAdminRoute({
  key: 'broadcast-duplicate',
  guard: { permission: 'manage_broadcast', scope: 'platform' },
  POST: mutate({
    query: CampaignIdQuery,
    status: 201,
    audit: 'broadcast_campaign_duplicate',
    handler: ({ query, ctx }) =>
      audited(ctx, duplicateCampaign(ctx, campaignIdOf(query.campaignId))),
  }),
});
