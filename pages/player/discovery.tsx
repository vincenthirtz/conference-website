// pages/player/discovery.tsx — coquille de « Réseau joueuses » : SEO, cache
// joueuse, coquille (session + redirection). L'écran vit dans le module
// features/player/network (lot P15, archétype Liste).
//
// Annuaire opt-in GLOBAL, INVISIBLE par défaut, DERRIÈRE LE LOGIN : `noindex`,
// et aucune donnée servie sans session.

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import DiscoveryScreen from '@/features/player/network/ui/DiscoveryScreen';

function PlayerDiscovery() {
  return <DiscoveryScreen />;
}

const playerDiscoverySeo: SeoProps = {
  title: {
    fr: 'Réseau joueuses',
    en: 'Player network',
  },
  description: {
    fr: 'Découvrez les joueuses visibles dans le réseau inter-organisations.',
    en: 'Discover players visible in the cross-organization network.',
  },
  noindex: true,
};

PlayerDiscovery.seo = playerDiscoverySeo;

// Coquille joueuse (lot P8) : session + redirection vers la même adresse
// qu'avant, navigation basse / rail.
export default withPlayerQuery(
  withPlayerShell(PlayerDiscovery, {
    redirectTo: '/login?next=/player/discovery',
  })
);
