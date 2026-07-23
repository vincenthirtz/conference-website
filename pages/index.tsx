import type { GetStaticProps } from 'next';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header/header';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { type Announcement } from '@/components/Ads/AnnouncementsTicker';
import HomeCountdown from '@/components/Home/HomeCountdown';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { loadHomeData } from '@/utils/home/loadHomeData';
import { useT } from '@/lib/i18n/useT';

// Above-the-fold: Header + HomeCountdown stay direct imports.
// HomeTwitchEmbed is client-only (handles auth/iframe).
const HomeTwitchEmbed = dynamic(
  () => import('@/components/Home/HomeTwitchEmbed'),
  { ssr: false }
);
// Below-the-fold: code-split into separate chunks. SSR stays on so news
// excerpts, tournament info and press logos remain in the initial HTML
// (good for SEO and content visibility before JS hydrates).
const HomeEvents = dynamic(() => import('@/components/Home/HomeEvents'));
const HomeNewsSection = dynamic(
  () => import('@/components/News/HomeNewsSection')
);
const HomeSponsors = dynamic(() => import('@/components/Home/HomeSponsors'));
const PressSection = dynamic(() => import('@/components/Press/PressSection'));
const NewsletterSignup = dynamic(() => import('@/components/NewsletterSignup'));
const AnnouncementsTicker = dynamic(
  () => import('@/components/Ads/AnnouncementsTicker')
);

type HomeProps = {
  news: HomeNewsItem[];
  announcements: Announcement[];
  upcomingTournament: UpcomingTournament | null;
  partners: HomePartner[];
  countdownTarget: string | null;
  // Vrai quand le chargement du contenu dynamique (news / annonces) a échoué
  // côté serveur. Permet d'afficher un avis d'erreur distinct d'un site
  // simplement vide, sans masquer le hero statique.
  loadError: boolean;
};

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  // S5d: pas de req → DEFAULT_TENANT_ID. TODO(S7) — switcher en SSR ou ISR
  // par-tenant quand le multi-tenant sera actif. Les loaders sont extraits dans
  // `utils/home/loadHomeData` (partagés avec la refonte en preview) ; la sortie
  // reste identique à l'ancien `getStaticProps` inline.
  const data = await loadHomeData(DEFAULT_TENANT_ID);

  return {
    props: {
      news: data.news,
      announcements: data.announcements,
      upcomingTournament: data.upcomingTournament,
      partners: data.partners,
      countdownTarget: data.countdownTarget,
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
  loadError,
}: HomeProps) {
  const t = useT('home');

  // Perf : met en pause les animations décoratives du hero (aurora + connecteur)
  // dès qu'il quitte le viewport — coût GPU/CPU nul hors-écran, rendu identique
  // quand visible.
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroPaused, setHeroPaused] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setHeroPaused(!entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div>
      <div
        ref={heroRef}
        className={heroPaused ? 'hero-anim-paused' : undefined}
      >
        <Header />

        {loadError && (
          <div className="container mx-auto px-4 mt-6">
            <div
              className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center"
              role="alert"
            >
              <p className="text-sm text-red-200">{t.loadError}</p>
            </div>
          </div>
        )}

        <div
          className="relative -mt-14 md:-mt-20 -mb-6 md:-mb-10 flex justify-center pointer-events-none select-none"
          aria-hidden="true"
        >
          <div className="hero-connector">
            <span className="hero-connector__halo hero-connector__halo--top" />
            <span className="hero-connector__beam" />
            <span className="hero-connector__pulse" />
            <span className="hero-connector__pulse hero-connector__pulse--delay" />
            <span className="hero-connector__diamond" />
            <span className="hero-connector__halo hero-connector__halo--bottom" />
          </div>
        </div>
      </div>

      <HomeCountdown targetDate={countdownTarget} />
      <HomeTwitchEmbed />
      <HomeEvents tournament={upcomingTournament} />
      <HomeNewsSection initialNews={news} />
      <HomeSponsors partners={partners} />
      <PressSection />

      <NewsletterSignup variant="section" source="homepage" />

      <div className="mt-5">
        <AnnouncementsTicker initialItems={announcements} />
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
