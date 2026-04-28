import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState, JSX } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

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

const DEFAULT_LIMIT = 6;

const formatTagLabel = (tag?: string | null) => {
  if (!tag) return 'General';
  const cleaned = tag.replace(/-/g, ' ').trim() || 'General';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

type HomeNewsSectionProps = {
  initialNews?: HomeNewsItem[];
};

function HomeNewsSection({
  initialNews = [],
}: HomeNewsSectionProps): JSX.Element {
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

  const renderCards = () => {
    if (!filteredNews.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Paragraph textColor="text-gray-200">
            {selectedTag === 'all'
              ? 'Aucune news pour le moment. Revenez bientôt !'
              : 'Aucune news pour cette catégorie pour le moment.'}
          </Paragraph>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-3">
        {filteredNews.map((item) => (
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
              <div className="relative w-full h-32 rounded-xl border border-white/10 overflow-hidden">
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                  loading="lazy"
                />
              </div>
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
      </div>
      {availableTags.length > 0 && (
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
      )}
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
