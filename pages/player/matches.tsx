// pages/player/matches.tsx
// Espace joueur — "Mes matchs".
//
// Coquille : SEO + provider de zone. Le contenu vit dans
// components/player/screens/PlayerMatchesScreen, partagé avec la vue
// d'inspection admin (cf. docs/PLAN-espace-unifie.md).

import PlayerMatchesScreen from '@/components/player/screens/PlayerMatchesScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

function PlayerMatches() {
  return (
    <PlayerAreaProvider>
      <PlayerMatchesScreen />
    </PlayerAreaProvider>
  );
}

const playerMatchesSeo: SeoProps = {
  title: {
    fr: 'Mes matchs',
    en: 'My matches',
  },
  description: {
    fr: "Calendrier et résultats des matchs de ton équipe OW Women's Cup.",
    en: "Schedule and results for your OW Women's Cup team's matches.",
  },
  noindex: true,
};

PlayerMatches.seo = playerMatchesSeo;

export default PlayerMatches;
