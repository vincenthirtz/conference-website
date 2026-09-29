// pages/player/matches.tsx
// Espace joueur — "Mes matchs".
//
// Coquille : SEO + provider de zone. Le contenu vit dans
// components/player/screens/PlayerMatchesScreen, partagé avec la vue
// d'inspection admin (cf. docs/PLAN-espace-unifie.md).

import PlayerMatchesScreen from '@/components/player/screens/PlayerMatchesScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';

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

// Coquille joueuse (lot P8) : session + redirection (même adresse que
// l'écran), navigation basse / rail.
export default withPlayerShell(PlayerMatches, {
  redirectTo: '/login?next=/player/matches',
});
