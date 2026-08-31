// components/Home/HomeNewsV2.tsx
//
// Section actualités de la refonte accueil : 3 cartes uniformes + lien "Toutes
// les actus →" vers /news. Rendu SSR (les cartes sont dans le HTML initial pour
// le SEO). Empty-state amical si aucune actu.

import type { JSX } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { type HomeNewsItem } from '@/components/News/HomeNewsSection';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

type HomeNewsV2Props = {
  news: HomeNewsItem[];
};

const formatTagLabel = (tag?: string | null) => {
  if (!tag) return 'General';
  const cleaned = tag.replace(/-/g, ' ').trim() || 'General';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

function formatDate(item: HomeNewsItem, locale: string) {
  const raw = item.publishedAt || item.createdAt;
  if (!raw) return null;
  return new Date(raw).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getExcerpt(item: HomeNewsItem, fallback: string, max = 140) {
  if (item.excerpt) return item.excerpt;
  if (!item.content) return fallback;
  if (item.content.length <= max) return item.content;
  return `${item.content.slice(0, max)}…`;
}

function NewsCard({ item }: { item: HomeNewsItem }) {
  const t = useT(nsHomeV2);
  const locale = useLocale();
  const date = formatDate(item, locale);
  return (
    <Link
      href={`/news/${item.slug}`}
      className="card-brand group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-elevated)] transition-all duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] motion-reduce:transform-none"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {item.imageUrl ? (
          // Un logo d'équipe n'est pas une bannière : le recadrer en `cover`
          // le décapite. On le pose entier sur le dégradé de repli.
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className={`transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transform-none ${
              item.imageFitContain
                ? 'bg-gradient-to-br from-[var(--color-violet)]/30 to-[var(--color-green)]/20 object-contain p-6'
                : 'object-cover'
            }`}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-violet)]/30 to-[var(--color-green)]/20" />
        )}
        {item.tag && (
          <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-green-light)]">
            {formatTagLabel(item.tag)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {date && (
          <span className="text-xs tracking-wide text-gray-500">{date}</span>
        )}
        <h3 className="text-balance text-[17px] font-bold leading-snug text-white">
          {item.title}
        </h3>
        <p className="line-clamp-2 text-sm text-gray-400">
          {getExcerpt(item, t.newsExcerptFallback, 120)}
        </p>
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[13px] font-semibold text-[var(--color-green-light)] transition group-hover:gap-2">
          {t.newsRead} <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}

export default function HomeNewsV2({ news }: HomeNewsV2Props): JSX.Element {
  const t = useT(nsHomeV2);
  const items = news.slice(0, 3);

  return (
    <section
      id="news"
      className="container mx-auto mt-16 px-4 md:mt-20 md:px-0"
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            {t.newsEyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {t.newsTitle}
          </h2>
        </div>
        <Link
          href="/news"
          className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-green-light)] transition hover:text-[var(--color-green)] sm:inline-flex"
        >
          {t.newsAll}
          <span aria-hidden>→</span>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300">
          {t.newsEmpty}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-center sm:hidden">
        <Link
          href="/news"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white transition hover:border-[var(--color-yellow)]/60 hover:text-[var(--color-yellow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
        >
          {t.newsAll}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
