// pages/player/my-teams.tsx
// Espace joueur — console multi-équipes (lot J4).
//
// À ne pas confondre avec /player/teams, qui est l'ANNUAIRE d'adversaires du
// réseau. Ici, ce sont MES équipes encadrées, vues côté préparation de journée.
//
// Coquille : SEO + provider de zone ; le contenu vit dans le screen partagé
// pour rester affichable en inspection admin.

import PlayerMyTeamsScreen from '@/components/player/screens/PlayerMyTeamsScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

function PlayerMyTeams() {
  return (
    <PlayerAreaProvider>
      <PlayerMyTeamsScreen />
    </PlayerAreaProvider>
  );
}

const seo: SeoProps = {
  title: { fr: 'Mes équipes', en: 'My teams' },
  description: {
    fr: 'État de préparation de chacune de tes équipes.',
    en: 'Readiness of each team you run.',
  },
  noindex: true,
};

PlayerMyTeams.seo = seo;

export default PlayerMyTeams;
