// features/player/notifications/client.ts — appels typés des notifications
// de la joueuse (lot P15).
//
// Les COMPTEURS suivent la portée (`?as=`, `?teamId=`) : `subject: 'follow'`.
// Les PRÉFÉRENCES ne la suivent jamais : `subject: 'self'`, rien n'est
// suffixé (l'écran les masque en inspection).
//
// La cloche de la barre du haut N'UTILISE PAS ce client : montée par `_app`,
// elle ne doit tirer ni TanStack ni features/player dans le bundle public ;
// elle garde son propre relevé (components/Navbar/PlayerTopBarBell.tsx).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type {
  NotificationPrefPutInput,
  NotificationPrefs,
  PlayerNotificationsPayload,
} from './schemas';

export const notificationsUrls = {
  counters: '/api/player/notifications',
  prefs: '/api/player/push/prefs',
};

export const notificationsClient = {
  counters: (scope: PlayerScope) =>
    playerRequest<PlayerNotificationsPayload>(notificationsUrls.counters, {
      scope,
      skipAuthRedirect: true,
    }),
  prefs: () =>
    playerRequest<NotificationPrefs>(notificationsUrls.prefs, {
      skipAuthRedirect: true,
    }),
  setPref: (body: NotificationPrefPutInput) =>
    playerRequest<NotificationPrefs>(notificationsUrls.prefs, {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
};
