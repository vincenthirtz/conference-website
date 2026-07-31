// pages/player/index.tsx
// Dashboard joueur - page principale pour les utilisateurs connectes.
//
// Coquille : SEO + provider de zone. Tout le contenu vit dans
// components/player/screens/PlayerDashboardScreen, partagé avec la vue
// d'inspection admin (cf. docs/PLAN-espace-unifie.md). Ici, pas de sujet et
// pas de lecture seule : la joueuse regarde son propre espace.

import PlayerDashboardScreen from '@/components/player/screens/PlayerDashboardScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

function PlayerDashboard() {
  return (
    <PlayerAreaProvider>
      <PlayerDashboardScreen />
    </PlayerAreaProvider>
  );
}

// Espace joueur : gate cote client, contenu prive. Le titre passe par le
// mecanisme `seo` consomme par _app.tsx ; `noindex` est de toute facon force
// pour toutes les routes /player (cf. _app.tsx → effectiveSeo).
const playerSeo: SeoProps = {
  title: {
    fr: 'Mon espace joueur',
    en: 'My player space',
  },
  description: {
    fr: "Espace joueur OW Women's Cup : profil, equipe, prochains matchs et demandes.",
    en: "OW Women's Cup player space: profile, team, upcoming matches and requests.",
  },
  noindex: true,
};

PlayerDashboard.seo = playerSeo;

export default PlayerDashboard;
