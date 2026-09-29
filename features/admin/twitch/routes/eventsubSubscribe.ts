// features/admin/twitch/routes/eventsubSubscribe.ts — POST /api/admin/twitch/eventsub/subscribe
// Souscriptions EventSub (transport websocket) pour la session ouverte par le
// navigateur de la régie. Le jeton broadcaster reste côté serveur.
// Ouverte au caster, comme /twitch/connection.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SubscribeDoc } from '../schemas';
import { subscribeWebsocket } from '../service/eventsub';
import { PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-eventsub-subscribe',
  guard: 'caster',
  POST: mutate({
    body: SubscribeDoc,
    rateLimit: PER_MIN_30,
    audit: 'subscribe_twitch_eventsub',
    handler: ({ ctx, req }) => audited(ctx, subscribeWebsocket(ctx, req.body)),
  }),
});
