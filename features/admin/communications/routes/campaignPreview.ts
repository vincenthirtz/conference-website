// features/admin/communications/routes/campaignPreview.ts — GET /api/admin/broadcast/[campaignId]/preview
// HTML rendu de la campagne (iframe admin), sous une CSP qui interdit tout
// script. Réponse HTML : écrite ici (`RESPONSE_SENT`), pas de JSON.

import {
  defineAdminRoute,
  RESPONSE_SENT,
  read,
} from '@/utils/admin/defineAdminRoute';
import { CampaignPreviewQuery } from '../schemas';
import { campaignIdOf, renderCampaignPreview } from '../service';

export default defineAdminRoute({
  key: 'broadcast-preview',
  guard: { permission: 'manage_broadcast', scope: 'platform' },
  GET: read({
    query: CampaignPreviewQuery,
    cache: false,
    handler: async ({ query, res }) => {
      const html = await renderCampaignPreview(
        campaignIdOf(query.campaignId),
        query.label
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src 'none'; frame-ancestors 'self'"
      );
      res.status(200).send(html);
      return RESPONSE_SENT;
    },
  }),
});
