import Link from 'next/link';
import { useEffect, useState, JSX } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';

type NewsItem = {
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

const DEFAULT_LIMIT = 9;

const formatTagLabel = (tag?: string | null) => {
  if (!tag) return 'General';
  const cleaned = tag.replace(/-/g, ' ').trim() || 'General';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const SITE_URL =
  typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    : '';
const RSS_URL = SITE_URL ? `${SITE_URL}/api/news/rss` : '/api/news/rss';

function HomeNewsSection(): JSX.Element {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: DEFAULT_LIMIT.toString(),
        });
        if (selectedTag !== 'all') {
          params.set('tag', selectedTag);
        }

        const res = await fetch(`/api/news?${params.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || 'Impossible de charger les news.');
        }
        if (mounted) {
          const items =
            json.items?.map((row: any) => ({
              id: row.id,
              title: row.title,
              slug: row.slug,
              tag: row.tag || 'general',
              excerpt: row.excerpt,
              content: row.content,
              imageUrl: row.imageUrl ?? row.image_url,
              publishedAt: row.publishedAt ?? row.published_at,
              createdAt: row.createdAt ?? row.created_at,
              updatedAt: row.updatedAt ?? row.updated_at,
              commentsCount:
                row.commentsCount ?? row.news_comments?.[0]?.count ?? 0,
            })) || [];
          setNews(items);
          setAvailableTags((prev) => {
            const tagsFromData = items.map((row) => row.tag || 'general');
            const merged = new Set([
              ...prev,
              ...tagsFromData,
              selectedTag !== 'all' ? selectedTag : null,
            ].filter(Boolean) as string[]);
            return Array.from(merged).sort();
          });
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || 'Erreur lors du chargement des news.');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [selectedTag]);

  const renderSkeletons = () => (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse"
        >
          <div className="h-3 w-24 bg-white/10 rounded mb-3" />
          <div className="h-6 w-5/6 bg-white/10 rounded mb-2" />
          <div className="h-4 w-4/6 bg-white/10 rounded mb-6" />
          <div className="h-24 w-full bg-white/5 rounded" />
        </div>
      ))}
    </div>
  );

  const renderCards = () => {
    if (isLoading) return renderSkeletons();
    if (error) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Paragraph textColor="text-gray-200">{error}</Paragraph>
          <div className="mt-4 flex justify-center">
            <Link href={RSS_URL} target="_blank" rel="noreferrer noopener">
              <Button type="button" className="px-6 h-[50px]">
                Flux RSS
              </Button>
            </Link>
          </div>
        </div>
      );
    }
    if (!news.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Paragraph textColor="text-gray-200">
            {selectedTag === 'all'
              ? 'Aucune news pour le moment. Revenez bientôt !'
              : "Aucune news pour cette catégorie pour le moment."}
          </Paragraph>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-3">
        {news.map((item) => (
          <Link
            key={item.id}
            href={`/news/${item.slug}`}
            className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3 hover:border-blue-300/70 hover:shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-blue-200/80">
              <span>
                {item.publishedAt || item.createdAt
                  ? new Date(
                      item.publishedAt || item.createdAt || ''
                    ).toLocaleDateString('fr-FR')
                  : 'News'}
              </span>
              <div className="flex items-center gap-2">
                {item.tag && (
                  <span className="px-2 py-1 rounded-full border border-blue-300/40 bg-blue-500/10 text-[10px] tracking-[0.12em] text-blue-100">
                    {formatTagLabel(item.tag)}
                  </span>
                )}
                <span>{item.commentsCount ?? 0} commentaire(s)</span>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-white leading-snug">
              {item.title}
            </h3>
            <Paragraph
              textColor="text-gray-200"
              className="text-sm leading-relaxed"
            >
              {item.excerpt ||
                item.content?.slice(0, 140) ||
                'Découvre les dernières informations du tournoi.'}
              {item.content && item.content.length > 140 ? '…' : ''}
            </Paragraph>
            {item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.title}
                className="w-full h-32 object-cover rounded-xl border border-white/10"
                loading="lazy"
              />
            )}
          </Link>
        ))}
      </div>
    );
  };

  return (
    <section
      className="container mt-20 flex flex-col gap-6 px-4 md:px-0"
      id="news"
    >
      <div className="flex flex-col items-center text-center">
        <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
          Actualités
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-3"
        >
          Dernières news OW Women&apos;s Cup
        </Heading>
        <Paragraph
          typeStyle="body-lg"
          className="mt-3 max-w-2xl"
          textColor="text-gray-200"
        >
          Les annonces officielles du tournoi, publiées par le staff.
        </Paragraph>
        <div className="mt-4">
          <Link href={RSS_URL} target="_blank" rel="noreferrer noopener">
            <Button type="button" className="px-6 h-[48px]">
              Flux RSS
            </Button>
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-2 items-center">
        <div className="text-xs uppercase tracking-[0.18em] text-blue-200/80">
          Filtrer par tag
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <FilterPill
            label="Toutes"
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
      {renderCards()}
    </section>
  );
}

export default HomeNewsSection;

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
      className={`px-3 py-1.5 rounded-full border text-xs uppercase tracking-[0.16em] transition ${
        active
          ? 'border-blue-400 bg-blue-500/20 text-blue-50 shadow-[0_6px_18px_rgba(59,130,246,0.35)]'
          : 'border-white/15 bg-white/5 text-gray-200 hover:border-white/30'
      }`}
    >
      {label}
    </button>
  );
}
