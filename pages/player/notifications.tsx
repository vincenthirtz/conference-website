// pages/player/notifications.tsx
//
// Coquille : SEO + provider de zone. Le contenu vit dans
// components/player/screens/PlayerNotificationsScreen, partagé avec la vue
// d'inspection admin (cf. docs/PLAN-espace-unifie.md).

import PlayerNotificationsScreen from '@/components/player/screens/PlayerNotificationsScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';

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

// Coquille joueuse (lot P8) : session + redirection (même adresse que
// l'écran), navigation basse / rail.
export default withPlayerShell(PlayerNotifications, {
  redirectTo: '/login?next=/player/notifications',
});
