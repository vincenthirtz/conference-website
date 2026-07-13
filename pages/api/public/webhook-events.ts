// GET /api/public/webhook-events
//
// Anonymous PUBLIC catalog of the webhook event types a tenant can subscribe
// to. Powers the developer-portal docs page + dashboard ("what events you can
// subscribe to") without duplicating the copy client-side.
//
// Posture: anon, CORS `*`, edge-cached (`s-maxage=3600`) — same as the other
// `/api/public/*` reads. The catalog is derived from `WEBHOOK_EVENT_TYPES`
// (utils/webhooks.ts), which is the PUBLIC subset of the outbox event names —
// internal Discord-only events (team.member.*, cast.*, scrim.planning.*, …) are
// never in that list, so they can never leak here.
//
// Response envelope (single):
//   { data: {
//       events: [{ type, description }],
//       signature: { header, algo, format }
//   } }

import {
  withPublicApi,
  single,
  type PublicHandlerResult,
} from '@/utils/publicApi';
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_DESCRIPTIONS,
} from '@/utils/webhooks';

type WebhookEventCatalog = {
  events: Array<{ type: string; description: string }>;
  signature: {
    header: string;
    algo: string;
    format: string;
  };
};

async function handler(): Promise<PublicHandlerResult<WebhookEventCatalog>> {
  const events = WEBHOOK_EVENT_TYPES.map((type) => ({
    type,
    description: WEBHOOK_EVENT_DESCRIPTIONS[type],
  }));

  return single({
    events,
    signature: {
      header: 'X-Webhook-Signature',
      algo: 'HMAC-SHA256',
      format: 'sha256=<hex>',
    },
  });
}

export default withPublicApi(handler, {
  rateLimitBucket: 'public-webhook-events',
  cacheSeconds: 3600,
});
