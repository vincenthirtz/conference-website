// pages/player/tcg/echanges.tsx — coquille de « Échanges de cartes » : SEO,
// cache joueuse, coquille (session + redirection). L'écran vit dans le module
// features/player/tcg (lot P14, archétype Liste).
//
// `noindex` comme le reste de l'espace : un échange entre deux personnes n'a
// rien à faire dans un moteur de recherche.

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import TradesScreen from '@/features/player/tcg/ui/trades/TradesScreen';

function PlayerTcgTrades() {
  return <TradesScreen />;
}

const playerTcgTradesSeo: SeoProps = {
  title: { fr: 'Échanges de cartes', en: 'Card trades' },
  description: {
    fr: 'Échange tes cartes en double avec d’autres collectionneuses.',
    en: 'Trade your duplicate cards with other collectors.',
  },
  noindex: true,
};

PlayerTcgTrades.seo = playerTcgTradesSeo;

// Coquille joueuse : session + redirection vers la même adresse qu'avant.
export default withPlayerQuery(
  withPlayerShell(PlayerTcgTrades, {
    redirectTo: '/login?next=/player/tcg/echanges',
  })
);
