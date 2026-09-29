// features/admin/twitch/routes/eventsubAlerts.ts — /api/admin/twitch/eventsub/alerts
//   GET    : abonnements de la boîte d'alertes, et ce qui manque.
//   POST   : crée les abonnements manquants (webhook, jeton d'application).
//   DELETE : les supprime tous (non journalisé, comme à l'origine).
// Le secret EventSub part chez Twitch, jamais dans la réponse ni le journal.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  getAlertsState,
  subscribeAlerts,
  unsubscribeAlerts,
} from '../service/eventsub';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-eventsub-alerts',
  guard: TWITCH_GUARD,
  GET: read({
    rateLimit: PER_MIN_30,
    handler: ({ ctx }) => getAlertsState(ctx),
  }),
  POST: mutate({
    rateLimit: PER_MIN_30,
    audit: 'subscribe_twitch_alerts',
    handler: ({ ctx }) => audited(ctx, subscribeAlerts(ctx)),
  }),
  DELETE: mutate({
    rateLimit: PER_MIN_30,
    audit: false,
    handler: ({ ctx }) => unsubscribeAlerts(ctx),
  }),
});
