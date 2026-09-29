// pages/player/notifications.tsx
//
// Coquille : SEO + provider de zone + cache joueuse. L'écran vit dans le
// module features/player/notifications (lot P15, archétype Fil), partagé avec
// la vue d'inspection admin (cf. docs/PLAN-espace-unifie.md).

import NotificationsScreen from '@/features/player/notifications/ui/NotificationsScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';

function PlayerNotifications() {
  return (
    <PlayerAreaProvider>
      <NotificationsScreen />
    </PlayerAreaProvider>
  );
}

const playerNotificationsSeo: SeoProps = {
  title: {
    fr: 'Notifications',
    en: 'Notifications',
  },
  description: {
    fr: 'Tes actions en attente et tes préférences de notifications push.',
    en: 'Your pending actions and push notification preferences.',
  },
  noindex: true,
};

PlayerNotifications.seo = playerNotificationsSeo;

// Coquille joueuse (lot P8) : session + redirection (même adresse que
// l'écran), navigation basse / rail.
export default withPlayerQuery(
  withPlayerShell(PlayerNotifications, {
    redirectTo: '/login?next=/player/notifications',
  })
);
