// pages/index.tsx
//
// Page d'accueil — refonte 2026 : structure resserrée en sections claires
// (barre d'annonce fine, hero focalisé avec countdown intégré, spotlight
// événement live-aware, « participer en 3 étapes », actus, soutiens, newsletter).
//
// Le chargement des données passe par le loader partagé `loadHomeData`
// (+ `loadTournamentPrizeCents` pour le spotlight). Les présentateurs V2 vivent
// sous `components/Home/*`.

import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { type Announcement } from '@/components/Ads/AnnouncementsTicker';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import {
  loadHomeData,
  loadTournamentPrizeCents,
} from '@/utils/home/loadHomeData';
import { useT } from '@/lib/i18n/useT';
import { useTwitchLive } from '@/components/Home/useTwitchLive';
import HomeTopAnnounce from '@/components/Home/HomeTopAnnounce';
import HomeHeroV2 from '@/components/Home/HomeHeroV2';
import HomeSpotlight from '@/components/Home/HomeSpotlight';
import HomeSteps from '@/components/Home/HomeSteps';
import HomeNewsV2 from '@/components/Home/HomeNewsV2';
import HomeSupportStrip from '@/components/Home/HomeSupportStrip';
import NewsletterSignup from '@/components/NewsletterSignup';

type HomeProps = {
  news: HomeNewsItem[];
  announcements: Announcement[];
  upcomingTournament: UpcomingTournament | null;
  partners: HomePartner[];
  countdownTarget: string | null;
  prizeCents: number | null;
  // Vrai quand le chargement du contenu dynamique a échoué côté serveur : on le
  // signale plutôt que d'afficher une home faussement vide (hero reste rendu).
  loadError: boolean;
};

// S5d: getStaticProps n'a pas la requête → DEFAULT_TENANT_ID. TODO(S7) SSR/ISR
// par tenant en multi-tenant.
export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const data = await loadHomeData(DEFAULT_TENANT_ID);
  const prizeCents = data.upcomingTournament
    ? await loadTournamentPrizeCents(data.upcomingTournament.id)
    : null;

  return {
    props: {
      news: data.news,
      announcements: data.announcements,
      upcomingTournament: data.upcomingTournament,
      partners: data.partners,
      countdownTarget: data.countdownTarget,
      prizeCents,
      loadError: data.loadError,
    },
    revalidate: 900,
  };
};

function Home({
  news,
  announcements,
  upcomingTournament,
  partners,
  countdownTarget,
  prizeCents,
  loadError,
}: HomeProps) {
  const t = useT('homeV2');
  const live = useTwitchLive();
  const topAnnouncement = announcements[0] ?? null;

  return (
    <div>
      <HomeTopAnnounce announcement={topAnnouncement} />

      <HomeHeroV2 countdownTarget={countdownTarget} isLive={live.live} />

      {loadError && (
        <div className="container mx-auto mt-6 px-4">
          <div
            className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm text-red-200">{t.loadError}</p>
          </div>
        </div>
      )}

      <HomeSpotlight
        tournament={upcomingTournament}
        prizeCents={prizeCents}
        live={live}
      />

      <HomeSteps />

      <HomeNewsV2 news={news} />

      <HomeSupportStrip partners={partners} />

      <div className="container mx-auto mt-16 px-4 md:mt-20 md:px-0">
        <NewsletterSignup variant="section" source="homepage" />
      </div>
    </div>
  );
}

const homeSeo: SeoProps = {
  description: {
    fr: "Tournoi Overwatch 100% féminin : suis l'édition 2026 — équipes, casts, inscriptions et calendrier des matchs en direct.",
    en: "The 100% women's Overwatch tournament: follow the 2026 edition — teams, casts, sign-ups and the live match schedule.",
  },
};

Home.seo = homeSeo;

export default Home;
