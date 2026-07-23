// pages/home-preview.tsx
//
// PREVIEW de la refonte accueil (non indexée). Rend la home condensée en 6
// sections claires : barre d'annonce fine, hero focalisé (countdown intégré),
// spotlight événement (carte tournoi + panneau Twitch live-aware), actus (3
// cartes), bande soutiens (sponsors + presse fusionnés), newsletter.
//
// Réutilise le loader partagé `loadHomeData` (identique à la home live) et les
// composants existants (NewsletterSignup) + de nouveaux présentateurs V2. Ne
// touche pas au rendu de `pages/index.tsx`.

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

type HomePreviewProps = {
  news: HomeNewsItem[];
  announcements: Announcement[];
  upcomingTournament: UpcomingTournament | null;
  partners: HomePartner[];
  countdownTarget: string | null;
  prizeCents: number | null;
  loadError: boolean;
};

export const getStaticProps: GetStaticProps<HomePreviewProps> = async () => {
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

function HomePreview({
  news,
  announcements,
  upcomingTournament,
  partners,
  countdownTarget,
  prizeCents,
  loadError,
}: HomePreviewProps) {
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

const homePreviewSeo: SeoProps = {
  title: {
    fr: 'Refonte accueil (preview)',
    en: 'Homepage redesign (preview)',
  },
  noindex: true,
};

HomePreview.seo = homePreviewSeo;

export default HomePreview;
