// pages/player/library.tsx — coquille de « Mon appartement » dans la Women's
// Library (docs/PLAN-womens-library.md, lot 4) : SEO, cache joueuse, coquille
// (session + redirection). L'écran vit dans le module features/player/library ;
// le moteur isométrique y est chargé à la demande (`next/dynamic`, ssr: false).
//
// `noindex` comme les autres pages de l'espace : un appartement personnel n'a
// rien à faire dans un moteur de recherche.

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import ApartmentScreen from '@/features/player/library/ui/apartment/ApartmentScreen';

function PlayerLibrary() {
  return <ApartmentScreen />;
}

const playerLibrarySeo: SeoProps = {
  title: { fr: 'Women’s Library', en: 'Women’s Library' },
  description: {
    fr: 'Ton appartement dans la Women’s Library : meubles, décor et avatar.',
    en: 'Your apartment in the Women’s Library: furniture, decor and avatar.',
  },
  noindex: true,
};

PlayerLibrary.seo = playerLibrarySeo;

// Compte obligatoire : une visiteuse non connectée part se connecter et revient.
export default withPlayerQuery(
  withPlayerShell(PlayerLibrary, { redirectTo: '/login?next=/player/library' })
);
