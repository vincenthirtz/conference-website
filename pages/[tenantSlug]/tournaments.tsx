// pages/[tenantSlug]/tournaments.tsx
//
// Liste des tournois D'UN ESPACE : `/mon-espace/tournaments`.
//
// Même chemin que la route historique, au préfixe près : c'est ce qui permet
// au middleware de réécrire un domaine propre (`cup-estivale.fr/tournaments`)
// vers cette page par simple préfixage, sans table de correspondance d'URL.
//
// SSR : deux espaces ne partagent jamais un cache de page.

import TournamentsPage, {
  type TournamentsPageProps,
} from '@/components/Tournaments/TournamentsPage';
import { loadPublicTournaments } from '@/utils/publicData/tournaments';
import { withTenantPage } from '@/utils/tenantPage';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

export const getServerSideProps = withTenantPage<TournamentsPageProps>(
  async ({ tenantId }) => loadPublicTournaments(tenantId)
);

function TenantTournamentsPage(props: TournamentsPageProps) {
  return <TournamentsPage {...props} />;
}

const seo: SeoProps = {
  title: { fr: 'Tournois', en: 'Tournaments' },
  description: {
    fr: 'Tous les tournois de cet espace : passés, en cours et à venir.',
    en: 'Every tournament of this space: past, ongoing and upcoming.',
  },
};

TenantTournamentsPage.seo = seo;

export default TenantTournamentsPage;
