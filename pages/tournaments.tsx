// pages/tournaments.tsx
// Page publique listant tous les tournois (passés, en cours, à venir).
//
// Route de l'espace HISTORIQUE : elle sert `DEFAULT_TENANT_ID` et garde sa
// génération statique (ISR 10 min). Les autres espaces passent par
// `pages/[tenantSlug]/tournaments.tsx`, en SSR — deux espaces ne peuvent pas
// partager un cache de page.
//
// Le chargement (`loadPublicTournaments`) et le rendu (`TournamentsPage`) sont
// communs aux deux routes. Le composant est ENVELOPPÉ plutôt que réexporté :
// `.seo` se pose sur la fonction, et deux pages qui décoreraient le même
// composant se marcheraient dessus.

import type { GetStaticProps } from 'next';
import TournamentsPage, {
  type TournamentsPageProps,
} from '@/components/Tournaments/TournamentsPage';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { loadPublicTournaments } from '@/utils/publicData/tournaments';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

export const getStaticProps: GetStaticProps<
  TournamentsPageProps
> = async () => {
  const props = await loadPublicTournaments(DEFAULT_TENANT_ID);
  return {
    props,
    // Une panne se re-tente vite ; une liste saine se rafraîchit posément.
    revalidate: props.loadError ? 60 : 600,
  };
};

function PlatformTournamentsPage(props: TournamentsPageProps) {
  return <TournamentsPage {...props} />;
}

const tournamentsSeo: SeoProps = {
  title: {
    fr: 'Tournois Overwatch féminins — toutes les éditions',
    en: "Women's Overwatch tournaments — every edition",
  },
  description: {
    fr: "Découvrez tous les tournois OW Women's Cup : passés, en cours et à venir. Brackets, résultats et équipes.",
    en: "Browse every OW Women's Cup tournament: past, ongoing and upcoming. Brackets, results and teams.",
  },
};

PlatformTournamentsPage.seo = tournamentsSeo;

export default PlatformTournamentsPage;
