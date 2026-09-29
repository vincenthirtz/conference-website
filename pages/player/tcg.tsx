// pages/player/tcg.tsx — coquille de « Ma collection » : SEO, cache joueuse,
// coquille (session + redirection). L'écran vit dans le module
// features/player/tcg (lot P14, archétype Collection).
//
// `noindex` comme les autres pages de l'espace : une collection personnelle
// n'a rien à faire dans un moteur de recherche.

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import TcgCollectionScreen from '@/features/player/tcg/ui/TcgCollectionScreen';

function PlayerTcg() {
  return <TcgCollectionScreen />;
}

const playerTcgSeo: SeoProps = {
  title: { fr: 'Ma collection', en: 'My collection' },
  description: {
    fr: 'Tes cartes à collectionner OW Women’s Cup : paquets, pièces et collection.',
    en: 'Your OW Women’s Cup collectible cards: packs, coins and collection.',
  },
  noindex: true,
};

PlayerTcg.seo = playerTcgSeo;

// Coquille joueuse : session + redirection vers la même adresse qu'avant.
export default withPlayerQuery(
  withPlayerShell(PlayerTcg, { redirectTo: '/login?next=/player/tcg' })
);
