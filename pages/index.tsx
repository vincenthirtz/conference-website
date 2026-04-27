/* eslint-disable @next/next/no-img-element */
import type { GetStaticProps } from 'next';
import Header from '@/components/Header/header';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import HomeNewsSection, { HomeNewsItem } from '@/components/News/HomeNewsSection';
import AnnouncementsTicker, { Announcement } from '@/components/Ads/AnnouncementsTicker';
import PressSection from '@/components/Press/PressSection';
import { supabaseAdmin } from '@/utils/supabase';

type HomeProps = {
  news: HomeNewsItem[];
  announcements: Announcement[];
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

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  let news: HomeNewsItem[] = [];
  let announcements: Announcement[] = [];

  if (supabaseAdmin) {
    const nowISO = new Date().toISOString();

    const [newsRes, announcementsRes] = await Promise.all([
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
    ]);

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
    props: { news, announcements },
    revalidate: 300,
  };
};

function Home({ news, announcements }: HomeProps) {
  return (
    <div>
      <img
        src="/img/illustra.png"
        className="color-effect"
        alt="background-illustration"
      />
      <Header />

      {/* <Popup /> */}
      <HomeNewsSection initialNews={news} />
      <PressSection />
      <div id="sponsors" className="mt-20"></div>

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
