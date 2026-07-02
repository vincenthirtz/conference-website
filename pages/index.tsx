import type { GetStaticProps } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Header from '@/components/Header/header';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { type Announcement } from '@/components/Ads/AnnouncementsTicker';
import HomeCountdown from '@/components/Home/HomeCountdown';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import { type HomePartner } from '@/components/Home/HomeSponsors';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

// Above-the-fold: Header + HomeCountdown stay direct imports.
// HomeTwitchEmbed is client-only (handles auth/iframe).
const HomeTwitchEmbed = dynamic(
  () => import('@/components/Home/HomeTwitchEmbed'),
  { ssr: false }
);
// Below-the-fold: code-split into separate chunks. SSR stays on so news
// excerpts, tournament info and press logos remain in the initial HTML
// (good for SEO and content visibility before JS hydrates).
const HomeIdahobitScrim = dynamic(
  () => import('@/components/Home/HomeIdahobitScrim')
);
const HomeEvents = dynamic(() => import('@/components/Home/HomeEvents'));
const HomeNewsSection = dynamic(
  () => import('@/components/News/HomeNewsSection')
);
const HomeSponsors = dynamic(() => import('@/components/Home/HomeSponsors'));
const PressSection = dynamic(() => import('@/components/Press/PressSection'));
const AnnouncementsTicker = dynamic(
  () => import('@/components/Ads/AnnouncementsTicker')
);

// Marge de troncature du `content` des news de la home. HomeNewsSection ne rend
// qu'un excerpt d'au plus ~220 caractères ; on garde une marge confortable.
const HOME_NEWS_CONTENT_MAX = 300;

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

function sanitizeAnnouncementUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) return url;
    return null;
  } catch {
    return null;
  }
}

// S5d: tenant id du build courant. `getStaticProps` n'a pas d'accès à la
// requête, donc on est forcés sur DEFAULT_TENANT_ID. TODO(S7) — quand on
// passera multi-tenant, ces pages basculeront en SSR (ou ISR par tenant).
async function loadUpcomingTournament(
  tenantId: string
): Promise<UpcomingTournament | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select(
      'id, name, slug, short_name, status, format, start_date, end_date, max_teams'
    )
    .eq('tenant_id', tenantId)
    .in('status', ['running', 'published'])
    .order('start_date', { ascending: true, nullsFirst: false });
  if (error || !data?.length) return null;

  const now = Date.now();
  const running = data.find((t) => t.status === 'running');
  const upcoming = data.find((t) => {
    if (t.status !== 'published' || !t.start_date) return false;
    return new Date(t.start_date).getTime() >= now;
  });
  const picked = running || upcoming;
  if (!picked) return null;

  const { count } = await supabaseAdmin
    .from('tournament_teams')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tournament_id', picked.id);

  return {
    id: picked.id,
    name: picked.name,
    slug: picked.slug,
    shortName: picked.short_name,
    status: picked.status,
    startDate: picked.start_date,
    endDate: picked.end_date,
    format: picked.format,
    maxTeams: picked.max_teams,
    teamCount: typeof count === 'number' ? count : 0,
  };
}

async function loadPartners(): Promise<HomePartner[]> {
  // `partners` n'est pas une table tenant-scopée (global / cross-tenant) —
  // on ne filtre pas par tenant_id ici (rappel S5d).
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('partners')
    .select('id, name, category, logo_url, website_url, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data
    .filter(
      (row: any) =>
        row.category === 'super' ||
        row.category === 'major' ||
        row.category === 'cultural'
    )
    .map((row: any) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      logoUrl: row.logo_url ?? null,
      websiteUrl: row.website_url ?? null,
    }));
}

async function loadCountdownSetting(): Promise<string | null> {
  // `site_settings` est une table globale (NOT tenant-scoped).
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', 'homepage_event_date')
    .maybeSingle();
  const fromSetting = (data?.value ?? '').trim();
  return fromSetting || null;
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  let news: HomeNewsItem[] = [];
  let announcements: Announcement[] = [];
  let upcomingTournament: UpcomingTournament | null = null;
  let partners: HomePartner[] = [];
  let countdownTarget: string | null = null;
  // Client absent = on n'a pas pu charger le contenu : on le signale plutôt
  // que d'afficher une home faussement vide.
  let loadError = !supabaseAdmin;

  // S5d: pas de req → DEFAULT_TENANT_ID. TODO(S7) — switcher en SSR ou ISR
  // par-tenant quand le multi-tenant sera actif.
  const tenantId = DEFAULT_TENANT_ID;

  if (supabaseAdmin) {
    const nowISO = new Date().toISOString();

    const [
      newsRes,
      announcementsRes,
      upcoming,
      partnersList,
      countdownSetting,
    ] = await Promise.all([
      supabaseAdmin
        .from('news')
        .select(
          'id, title, slug, tag, excerpt, content, image_url, published_at, created_at, updated_at, news_comments(count)'
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .or(`published_at.lte.${nowISO},published_at.is.null`)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(30),
      supabaseAdmin
        .from('announcements')
        .select('id, title, message, cta_label, cta_url, priority, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('priority', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(6),
      loadUpcomingTournament(tenantId),
      loadPartners(),
      loadCountdownSetting(),
    ]);

    upcomingTournament = upcoming;
    partners = partnersList;
    countdownTarget = countdownSetting ?? upcomingTournament?.startDate ?? null;

    // Une erreur sur les requêtes de contenu (news / annonces) signale une
    // panne, à distinguer d'un contenu légitimement vide.
    if (newsRes.error || announcementsRes.error) {
      loadError = true;
    }

    if (!newsRes.error && newsRes.data) {
      news = newsRes.data.map((row: any) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        tag: row.tag || 'general',
        excerpt: row.excerpt,
        // La home n'affiche qu'un excerpt tronqué (jusqu'à ~220 caractères via
        // HomeNewsSection.getExcerpt). Sérialiser le `content` complet de 30
        // news gonflait inutilement __NEXT_DATA__ sur la page la plus vue : on
        // tronque côté serveur, avec une marge > à la fenêtre d'excerpt.
        content:
          typeof row.content === 'string'
            ? row.content.slice(0, HOME_NEWS_CONTENT_MAX)
            : row.content,
        imageUrl: row.image_url,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        commentsCount: row.news_comments?.[0]?.count ?? 0,
      }));
    }

    if (!announcementsRes.error && announcementsRes.data) {
      announcements = announcementsRes.data.map((row: any) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        ctaLabel: row.cta_label,
        ctaUrl: sanitizeAnnouncementUrl(row.cta_url),
      }));
    }
  }

  return {
    props: {
      news,
      announcements,
      upcomingTournament,
      partners,
      countdownTarget,
      loadError,
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
  return (
    <div>
      <Head>
        <link
          rel="preload"
          as="image"
          type="image/avif"
          imageSrcSet="/img/illustra-640.avif 640w, /img/illustra-1024.avif 1024w"
          imageSizes="(max-width: 768px) 640px, 1024px"
          fetchPriority="high"
        />
      </Head>
      <Header />

      {loadError && (
        <div className="container mx-auto px-4 mt-6">
          <div
            className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center"
            role="alert"
          >
            <p className="text-sm text-red-200">
              Une partie du contenu n&apos;a pas pu être chargée. Réessayez dans
              quelques instants.
            </p>
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

      <HomeCountdown targetDate={countdownTarget} />
      <HomeTwitchEmbed />
      <HomeIdahobitScrim />
      <HomeEvents tournament={upcomingTournament} />
      <HomeNewsSection initialNews={news} />
      <HomeSponsors partners={partners} />
      <PressSection />

      <div className="mt-5">
        <AnnouncementsTicker initialItems={announcements} />
      </div>
    </div>
  );
}

const homeSeo: SeoProps = {
  description:
    "Tournoi Overwatch 100% féminin : suis l'édition 2026 — équipes, casts, inscriptions et calendrier des matchs en direct.",
};

Home.seo = homeSeo;

export default Home;
