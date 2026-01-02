import Link from 'next/link';
import { useEffect, useState, JSX } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';

type NewsItem = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const SITE_URL =
  typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    : '';
const RSS_URL = SITE_URL ? `${SITE_URL}/api/news/rss` : '/api/news/rss';

function HomeNewsSection(): JSX.Element {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/news?limit=3');
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
              excerpt: row.excerpt,
              content: row.content,
              imageUrl: row.imageUrl ?? row.image_url,
              publishedAt: row.publishedAt ?? row.published_at,
              createdAt: row.createdAt ?? row.created_at,
              updatedAt: row.updatedAt ?? row.updated_at,
            })) || [];
          setNews(items);
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
  }, []);

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
            Aucune news pour le moment. Revenez bientôt !
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
      {renderCards()}
    </section>
  );
}

export default HomeNewsSection;
