// pages/news/index.tsx
// Liste paginée des actualités du SITE (table `news`, articles publiés).
// À distinguer de /actualites qui agrège les news/patch-notes Blizzard.

import { useState } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveNewsImage } from '@/utils/news/newsImage';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

import { logger } from '../../utils/logger';
import nsNewsIndex from '@/lib/i18n/locales/fr/newsIndex';
import nsNewsTags from '@/lib/i18n/locales/fr/newsTags';
import { newsTagLabel } from '@/utils/news/newsTag';

const PAGE_SIZE = 9;

type NewsItem = {
  id: string;
  title: string;
  slug: string;
  tag: string;
  excerpt: string | null;
  imageUrl: string | null;
  /** `imageUrl` est un logo (équipe ou tournoi) → cadrage `contain`. */
  imageFitContain: boolean;
  publishedAt: string | null;
  createdAt: string | null;
};

type NewsIndexProps = {
  news: NewsItem[];
  loadError: boolean;
};

export const getStaticProps: GetStaticProps<NewsIndexProps> = async () => {
  let news: NewsItem[] = [];
  let loadError = false;

  if (supabaseAdmin) {
    const nowISO = new Date().toISOString();

    // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — ISR par tenant).
    const { data, error } = await supabaseAdmin
      .from('news')
      .select(
        'id, title, slug, tag, excerpt, image_url, published_at, created_at, teams(logo_url)'
      )
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('status', 'published')
      .or(`published_at.lte.${nowISO},published_at.is.null`)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(60);

    if (error) {
      logger.error('[news index] fetch error', error);
      loadError = true;
    } else if (data) {
      news = data
        .filter((row: any) => row.slug)
        .map((row: any) => {
          const image = resolveNewsImage(row.image_url, row.teams);
          return {
            id: row.id,
            title: row.title,
            slug: row.slug,
            tag: row.tag || 'general',
            excerpt: row.excerpt || null,
            imageUrl: image.url,
            imageFitContain: image.fitContain,
            publishedAt: row.published_at || null,
            createdAt: row.created_at || null,
          };
        });
    }
  }

  return {
    props: { news, loadError },
    revalidate: 300,
  };
};

function NewsCard({ item }: { item: NewsItem }) {
  const t = useT(nsNewsIndex);
  const tagLabels = useT(nsNewsTags);
  const locale = useLocale();
  const dateStr =
    item.publishedAt || item.createdAt
      ? new Date(item.publishedAt || item.createdAt || '').toLocaleDateString(
          locale,
          { day: '2-digit', month: 'short', year: 'numeric' }
        )
      : null;
  const tagLabel = newsTagLabel(item.tag, tagLabels);

  return (
    <Link
      href={`/news/${item.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-blue-400/50 hover:bg-white/[0.06]"
    >
      {item.imageUrl ? (
        <div className="relative h-44 overflow-hidden">
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={`transition group-hover:scale-105 ${
              item.imageFitContain
                ? 'bg-gradient-to-br from-purple-900/40 via-neutral-900 to-blue-900/30 object-contain p-6'
                : 'object-cover'
            }`}
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 to-transparent" />
        </div>
      ) : (
        <div className="h-44 bg-gradient-to-br from-purple-900/40 via-neutral-900 to-blue-900/30" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          {tagLabel && (
            <span className="rounded-full border border-blue-300/30 bg-blue-500/10 px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-200">
              {tagLabel}
            </span>
          )}
          {dateStr && <span>{dateStr}</span>}
        </div>
        <h2 className="mt-3 line-clamp-2 text-lg font-semibold text-white transition group-hover:text-blue-200">
          {item.title}
        </h2>
        {item.excerpt && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-300">
            {item.excerpt}
          </p>
        )}
        <div className="mt-auto pt-4 flex items-center gap-2 text-sm text-blue-300 transition group-hover:text-blue-200">
          <span>{t.readArticle}</span>
          <span className="transition transform group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}

function NewsIndexPage({ news, loadError }: NewsIndexProps) {
  const t = useT(nsNewsIndex);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = news.slice(0, visible);
  const hasMore = visible < news.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="container mx-auto px-4 pt-28 pb-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-block border-b-2 border-purple-400 text-lg font-semibold text-white">
            {t.headerEyebrow}
          </div>
          <Heading typeStyle="heading-lg" level="h1" className="text-gradient">
            {t.headerTitle}
          </Heading>
          <div className="mx-auto mt-4 max-w-2xl">
            <Paragraph typeStyle="body-lg" textColor="text-neutral-300">
              {t.headerSubtitleBefore}
              <Link
                href="/actualites"
                className="text-blue-300 underline hover:text-blue-200"
              >
                {t.headerSubtitleLink}
              </Link>
              {t.headerSubtitleAfter}
            </Paragraph>
          </div>
        </div>

        {/* Content */}
        {loadError ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-8 text-center text-red-100">
            {t.loadError}
          </div>
        ) : news.length === 0 ? (
          <div className="py-20 text-center">
            <Paragraph textColor="text-neutral-400" className="text-lg">
              {t.empty}
            </Paragraph>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {shown.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/10"
                >
                  {t.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const newsIndexSeo: SeoProps = {
  title: {
    fr: 'Actualités du site',
    en: 'Site news',
  },
  description: {
    fr: "Toutes les actualités de l'OW Women's Cup : annonces, coulisses du tournoi et nouvelles de la communauté esport féminine.",
    en: "All the latest from OW Women's Cup: announcements, behind-the-scenes and news from the women's esport community.",
  },
};

NewsIndexPage.seo = newsIndexSeo;

export default NewsIndexPage;
