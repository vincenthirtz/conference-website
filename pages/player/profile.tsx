// pages/player/profile.tsx — coquille de « Mon profil » (SEO, cache, session) :
// écran features/player/profile (P9, Fiche) + section réseau (P15).

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import ProfileScreen from '@/features/player/profile/ui/ProfileScreen';
import DiscoverySettingsPanel from '@/features/player/network/ui/DiscoverySettingsPanel';

function PlayerProfile() {
  return <ProfileScreen discovery={<DiscoverySettingsPanel />} />;
}

const playerProfileSeo: SeoProps = {
  title: {
    fr: 'Mon profil',
    en: 'My profile',
  },
  description: {
    fr: "Gère ton compte joueur OW Women's Cup : profil, email, mot de passe et données personnelles.",
    en: "Manage your OW Women's Cup player account: profile, email, password and personal data.",
  },
  noindex: true,
};

PlayerProfile.seo = playerProfileSeo;

// Coquille joueuse (lot P8) : session + redirection vers la même adresse
// qu'avant, navigation basse / rail.
export default withPlayerQuery(
  withPlayerShell(PlayerProfile, { redirectTo: '/login?next=/player/profile' })
);
