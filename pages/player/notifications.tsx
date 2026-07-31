// pages/player/notifications.tsx
//
// Coquille : SEO + provider de zone. Le contenu vit dans
// components/player/screens/PlayerNotificationsScreen, partagé avec la vue
// d'inspection admin (cf. docs/PLAN-espace-unifie.md).

import PlayerNotificationsScreen from '@/components/player/screens/PlayerNotificationsScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

function PlayerNotifications() {
  return (
    <PlayerAreaProvider>
      <PlayerNotificationsScreen />
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

export default PlayerNotifications;
