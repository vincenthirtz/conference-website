import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState, JSX } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

export type HomeNewsItem = {
  id: string;
  title: string;
  slug: string;
  tag?: string | null;
  excerpt?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  commentsCount?: number;
};

const DEFAULT_LIMIT = 5;

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

type HomeNewsSectionProps = {
  initialNews?: HomeNewsItem[];
};

function HomeNewsSection({
  initialNews = [],
}: HomeNewsSectionProps): JSX.Element {
  const t = useT('homeNews');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const item of initialNews) {
      if (item.tag) tags.add(item.tag);
    }
    return Array.from(tags).sort();
  }, [initialNews]);

  const filteredNews = useMemo(() => {
    const items =
      selectedTag === 'all'
        ? initialNews
        : initialNews.filter((item) => item.tag === selectedTag);
    return items.slice(0, DEFAULT_LIMIT);
  }, [initialNews, selectedTag]);

  const [featured, ...secondaries] = filteredNews;

  const renderEmpty = () => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      <Paragraph textColor="text-gray-200">
        {selectedTag === 'all' ? t.emptyAll : t.emptyCategory}
      </Paragraph>
    </div>
  );

  return (
    <section
      className="container mt-20 flex flex-col gap-6 px-4 md:px-0"
      id="news"
    >
      <div className="flex flex-col items-center text-center">
        <div className="section-eyebrow text-xl text-white font-semibold mb-1">
          {t.eyebrow}
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-brand-gradient text-center lg:mt-3"
        >
          {t.title}
        </Heading>
        <span className="brand-rule mx-auto mt-3" aria-hidden />
        <Paragraph
          typeStyle="body-lg"
          className="mt-3 max-w-2xl"
          textColor="text-gray-200"
        >
          {t.subtitle}
        </Paragraph>
      </div>
      {availableTags.length > 0 && (
        <div className="flex flex-col gap-2 items-center">
          <div className="text-xs uppercase tracking-[0.18em] text-blue-200/80">
            {t.filterByTag}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <FilterPill
              label={t.filterAll}
              active={selectedTag === 'all'}
              onClick={() => setSelectedTag('all')}
            />
            {availableTags.map((tag) => (
              <FilterPill
                key={tag}
                label={formatTagLabel(tag)}
                active={selectedTag === tag}
                onClick={() => setSelectedTag(tag)}
              />
            ))}
          </div>
        </div>
      )}

      {!filteredNews.length ? (
        renderEmpty()
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {featured && (
            <div className="md:col-span-2">
              <FeaturedCard item={featured} />
            </div>
          )}
          {secondaries.length > 0 && (
            <div className="flex flex-col gap-4">
              {secondaries.slice(0, 4).map((item) => (
                <CompactCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center">
        <Link
          href="/actualites"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white transition hover:border-[var(--color-yellow)]/60 hover:bg-[var(--color-yellow)]/10 hover:text-[var(--color-yellow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
        >
          {t.allNews}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}

export default HomeNewsSection;

function FeaturedCard({ item }: { item: HomeNewsItem }) {
  const t = useT('homeNews');
  const locale = useLocale();
  const date = formatDate(item, locale);
  return (
    <Link
      href={`/news/${item.slug}`}
      className="news-featured card-brand group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white/5 transition-all duration-300"
    >
      {item.imageUrl ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="(max-width: 768px) 100vw, 66vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        </div>
      ) : (
        <div className="aspect-[16/9] w-full bg-gradient-to-br from-purple-500/30 via-blue-500/20 to-cyan-500/20" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-blue-200/80">
          <span className="inline-flex items-center rounded-full border border-[var(--color-yellow)]/50 bg-[var(--color-yellow)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--color-yellow)]">
            {t.featured}
          </span>
          {item.tag && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-blue-100">
              {formatTagLabel(item.tag)}
            </span>
          )}
          {date && <span>{date}</span>}
          <span className="text-gray-400">
            ·{' '}
            {format(
              (item.commentsCount ?? 0) > 1 ? t.comments_other : t.comments_one,
              { count: item.commentsCount ?? 0 }
            )}
          </span>
        </div>
        <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">
          {item.title}
        </h3>
        <Paragraph
          textColor="text-gray-200"
          className="text-sm md:text-base leading-relaxed line-clamp-3"
        >
          {getExcerpt(item, t.excerptFallback, 220)}
        </Paragraph>
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-[var(--color-green)] transition group-hover:gap-2">
          {t.readArticle} <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}

function CompactCard({ item }: { item: HomeNewsItem }) {
  const locale = useLocale();
  const date = formatDate(item, locale);
  return (
    <Link
      href={`/news/${item.slug}`}
      className="news-compact card-brand group flex gap-3 overflow-hidden rounded-2xl bg-white/5 p-3 transition-all duration-300"
    >
      <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="96px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-purple-500/20" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-blue-200/80">
          {item.tag && (
            <span className="rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] text-blue-100">
              {formatTagLabel(item.tag)}
            </span>
          )}
          {date && <span className="truncate">{date}</span>}
        </div>
        <h4 className="text-sm font-semibold text-white leading-snug line-clamp-2">
          {item.title}
        </h4>
      </div>
    </Link>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`filter-pill px-3 py-1.5 rounded-full border text-xs uppercase tracking-[0.16em] transition-all duration-300 ${
        active
          ? 'filter-pill--active border-[var(--color-violet)]/60 bg-[var(--color-violet)]/15 text-white'
          : 'border-white/15 bg-white/5 text-gray-200 hover:border-[var(--color-violet)]/40'
      }`}
    >
      {label}
    </button>
  );
}
