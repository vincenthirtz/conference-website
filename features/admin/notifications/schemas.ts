// features/admin/notifications/schemas.ts — Web Push du staff : abonnement
// d'un appareil, préférences par type d'événement, badge non-lu.
//
// Les corps gardent leur erreur historique (`{ error: 'Validation échouée.',
// code: 'INVALID_BODY', fields }`, `fields` au format `flatten().fieldErrors`) :
// le service les applique et la reproduit.

import * as z from 'zod';
import { WEB_PUSH_EVENT_TYPES } from '@/utils/webPushEvents';

export { pushSubscribeBodySchema as PushSubscribeBody } from '@/utils/pushSubscriptionUpsert';

export const PushUnsubscribeBody = z.object({
  endpoint: z.string().trim().url('endpoint must be a valid URL').max(2048),
});

export const NotificationPrefsPutBody = z.object({
  prefs: z
    .array(
      z.object({
        event_type: z.enum(WEB_PUSH_EVENT_TYPES),
        enabled: z.boolean(),
      })
    )
    .max(WEB_PUSH_EVENT_TYPES.length * 2), // borne large, permet doublons côté client
});

export type NotificationPref = { event_type: string; enabled: boolean };
