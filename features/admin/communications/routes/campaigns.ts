// features/admin/communications/routes/campaigns.ts — /api/admin/broadcast
// GET : page du catalogue des campagnes (DB + builtin) avec stats, planning
// et compteurs de destinataires ; POST : création depuis le formulaire.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CampaignInputDoc, CampaignListQuery } from '../schemas';
import { createCampaign, listCampaignSummaries } from '../service';

export default defineAdminRoute({
  key: 'broadcast-campaigns',
  guard: { permission: 'manage_broadcast' },
  GET: read({
    query: CampaignListQuery,
    handler: ({ query, ctx }) => listCampaignSummaries(ctx, query),
  }),
  POST: mutate({
    body: CampaignInputDoc,
    status: 201,
    audit: 'broadcast_campaign_create',
    handler: ({ body, ctx }) => audited(ctx, createCampaign(ctx, body)),
  }),
});
