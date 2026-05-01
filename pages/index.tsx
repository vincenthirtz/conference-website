import type { GetStaticProps } from 'next';
import Header from '@/components/Header/header';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import HomeNewsSection, {
  HomeNewsItem,
} from '@/components/News/HomeNewsSection';
import AnnouncementsTicker, {
  Announcement,
} from '@/components/Ads/AnnouncementsTicker';
import PressSection from '@/components/Press/PressSection';
import HomeCountdown from '@/components/Home/HomeCountdown';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import HomeEvents from '@/components/Home/HomeEvents';
import HomeTwitchEmbed from '@/components/Home/HomeTwitchEmbed';
import HomeSponsors, { HomePartner } from '@/components/Home/HomeSponsors';
import HomeQuickLinks from '@/components/Home/HomeQuickLinks';
import { supabaseAdmin } from '@/utils/supabase';

type HomeProps = {
  news: HomeNewsItem[];
  announcements: Announcement[];
  upcomingTournament: UpcomingTournament | null;
  partners: HomePartner[];
  countdownTarget: string | null;
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

async function loadUpcomingTournament(): Promise<UpcomingTournament | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select(
      'id, name, slug, short_name, status, format, start_date, end_date, max_teams'
    )
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

async function loadCountdownTarget(
  fallbackStartDate: string | null
): Promise<string | null> {
  if (!supabaseAdmin) return fallbackStartDate;
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', 'homepage_event_date')
    .maybeSingle();
  const fromSetting = (data?.value ?? '').trim();
  if (fromSetting) return fromSetting;
  return fallbackStartDate;
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  let news: HomeNewsItem[] = [];
  let announcements: Announcement[] = [];
  let upcomingTournament: UpcomingTournament | null = null;
  let partners: HomePartner[] = [];
  let countdownTarget: string | null = null;

  if (supabaseAdmin) {
    const nowISO = new Date().toISOString();

    const [newsRes, announcementsRes, upcoming, partnersList] =
      await Promise.all([
        supabaseAdmin
          .from('news')
          .select(
            'id, title, slug, tag, excerpt, content, image_url, published_at, created_at, updated_at, news_comments(count)'
          )
          .eq('status', 'published')
          .or(`published_at.lte.${nowISO},published_at.is.null`)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(30),
        supabaseAdmin
          .from('announcements')
          .select(
            'id, title, message, cta_label, cta_url, priority, created_at'
          )
          .eq('is_active', true)
          .order('priority', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(6),
        loadUpcomingTournament(),
        loadPartners(),
      ]);

    upcomingTournament = upcoming;
    partners = partnersList;
    countdownTarget = await loadCountdownTarget(
      upcomingTournament?.startDate ?? null
    );

    if (!newsRes.error && newsRes.data) {
      news = newsRes.data.map((row: any) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        tag: row.tag || 'general',
        excerpt: row.excerpt,
        content: row.content,
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
    },
    revalidate: 300,
  };
};

function Home({
  news,
  announcements,
  upcomingTournament,
  partners,
  countdownTarget,
}: HomeProps) {
  return (
    <div>
      <Header />

      <HomeCountdown targetDate={countdownTarget} />
      <HomeTwitchEmbed />
      <HomeEvents tournament={upcomingTournament} />
      <HomeQuickLinks />
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
  title: "OW Women's Cup 2026",
  description:
    "Tournoi Overwatch 100% féminin : cast, équipes, inscriptions et infos clés de l'édition 2026 de l'OW Women's Cup.",
};

Home.seo = homeSeo;

export default Home;
