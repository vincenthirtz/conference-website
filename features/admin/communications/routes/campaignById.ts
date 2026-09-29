// features/admin/communications/routes/campaignById.ts — /api/admin/broadcast/[campaignId]
// POST : envoi (test / aperçu / diff / fenêtre) ; PATCH : édition ; DELETE :
// suppression (campagne + planning + snapshot). Les campagnes builtin sont
// figées (403). Pour un envoi étalé : …/schedule.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CampaignIdQuery, CampaignInputDoc, CampaignSendDoc } from '../schemas';
import {
  campaignIdOf,
  deleteCampaign,
  sendCampaign,
  updateCampaign,
} from '../service';

export default defineAdminRoute({
  key: 'broadcast-campaign',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_broadcast', scope: 'platform' },
  POST: mutate({
    query: CampaignIdQuery,
    body: CampaignSendDoc,
    audit: 'broadcast_campaign_send',
    handler: ({ query, body, ctx }) =>
      audited(ctx, sendCampaign(ctx, campaignIdOf(query.campaignId), body)),
  }),
  PATCH: mutate({
    query: CampaignIdQuery,
    body: CampaignInputDoc,
    audit: 'broadcast_campaign_update',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updateCampaign(ctx, campaignIdOf(query.campaignId), body)),
  }),
  DELETE: mutate({
    query: CampaignIdQuery,
    audit: 'broadcast_campaign_delete',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteCampaign(ctx, campaignIdOf(query.campaignId))),
  }),
});
