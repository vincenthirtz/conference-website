// features/admin/communications/routes/campaignSchedule.ts — /api/admin/broadcast/[campaignId]/schedule
// GET : état du planning ; POST { waveSize } : planifie + snapshote les
// destinataires ; DELETE : annule (les `pending` partent, l'historique reste).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CampaignIdQuery, CampaignScheduleDoc } from '../schemas';
import {
  campaignIdOf,
  cancelCampaignSchedule,
  getCampaignSchedule,
  scheduleCampaign,
} from '../service';

export default defineAdminRoute({
  key: 'broadcast-schedule',
  guard: { permission: 'manage_broadcast' },
  GET: read({
    query: CampaignIdQuery,
    handler: ({ query, ctx }) =>
      getCampaignSchedule(ctx, campaignIdOf(query.campaignId)),
  }),
  POST: mutate({
    query: CampaignIdQuery,
    body: CampaignScheduleDoc,
    audit: 'broadcast_schedule_set',
    handler: ({ query, body, ctx }) =>
      audited(ctx, scheduleCampaign(ctx, campaignIdOf(query.campaignId), body)),
  }),
  DELETE: mutate({
    query: CampaignIdQuery,
    audit: 'broadcast_schedule_cancel',
    handler: ({ query, ctx }) =>
      audited(ctx, cancelCampaignSchedule(ctx, campaignIdOf(query.campaignId))),
  }),
});
