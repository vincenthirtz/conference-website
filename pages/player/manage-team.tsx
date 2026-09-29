// pages/player/manage-team.tsx
//
// Coquille : SEO + provider de zone. Le contenu vit dans
// components/player/screens/PlayerManageTeamScreen, partagé avec la vue
// capitaine d'inspection admin (cf. docs/PLAN-espace-unifie.md).

import PlayerManageTeamScreen from '@/components/player/screens/PlayerManageTeamScreen';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerQuery } from '@/features/player/_shared/query';

function ManageTeamPage() {
  return (
    <PlayerAreaProvider>
      <PlayerManageTeamScreen />
    </PlayerAreaProvider>
  );
}

const manageTeamSeo: SeoProps = {
  title: {
    fr: 'Gérer mon équipe',
    en: 'Manage my team',
  },
  description: {
    fr: "Gère les membres et les infos de ton équipe OW Women's Cup.",
    en: "Manage your OW Women's Cup team's members and details.",
  },
  noindex: true,
};

ManageTeamPage.seo = manageTeamSeo;

// Cache joueuse (lot P5) : `seo` est recopié sur l'enveloppe.
export default withPlayerQuery(ManageTeamPage);
