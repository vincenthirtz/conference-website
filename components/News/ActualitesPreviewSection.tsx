import { useEffect, useState, JSX } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';

type PatchNote = {
  id: string;
  title: string;
  date: string;
  link: string;
  summary: string;
  heroes: { name: string; icon: string; summary: string; category: string }[];
};

type BlizzardNews = {
  id: string;
  title: string;
  date: string;
  link: string;
  image_url: string | null;
  category: string | null;
  summary: string;
};

type CombinedItem =
  | { type: 'patch'; data: PatchNote }
  | { type: 'news'; data: BlizzardNews };

function ActualitesPreviewSection(): JSX.Element {
  const [items, setItems] = useState<CombinedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const [patchRes, newsRes] = await Promise.all([
          fetch('/api/patch-notes'),
          fetch('/api/blizzard-news?limit=4'),
        ]);

        const patchData = await patchRes.json();
        const newsData = await newsRes.json();

        if (!isMounted) return;

        const combined: CombinedItem[] = [];

        // Ajouter les 2 derniers patch notes
        (patchData.items || []).slice(0, 2).forEach((p: PatchNote) => {
          combined.push({ type: 'patch', data: p });
        });

        // Ajouter les 2 dernières news
        (newsData.items || []).slice(0, 2).forEach((n: BlizzardNews) => {
          combined.push({ type: 'news', data: n });
        });

        setItems(combined);
      } catch (err) {
        console.error('Failed to load actualités preview', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const renderLoading = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-5"
        >
          <div className="h-3 w-20 rounded-full bg-white/10" />
          <div className="mt-4 h-5 w-3/4 rounded bg-white/10" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full rounded bg-white/10" />
            <div className="h-3 w-2/3 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderPatchCard = (note: PatchNote) => (
    <Link
      key={`patch-${note.id}`}
      href={note.link}
      target="_blank"
      rel="noreferrer noopener"
      className="group relative flex flex-col rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-950/20 to-neutral-900/30 p-5 transition hover:border-orange-400/50 hover:shadow-lg"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-medium uppercase tracking-wide">
          Patch
        </span>
        <span className="text-neutral-500">{note.date}</span>
      </div>
      <h3 className="mt-3 text-base font-semibold text-white group-hover:text-orange-200 transition line-clamp-2">
        {note.title}
      </h3>
      <p className="mt-2 text-sm text-neutral-400 leading-relaxed line-clamp-2">
        {note.summary}
      </p>
      {note.heroes && note.heroes.length > 0 && (
        <div className="mt-3 flex -space-x-1.5">
          {note.heroes.slice(0, 4).map((hero) =>
            hero.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={hero.name}
                src={hero.icon}
                alt={hero.name}
                title={hero.name}
                className="h-6 w-6 rounded-full border border-neutral-800 object-contain bg-white/10"
              />
            ) : null
          )}
          {note.heroes.length > 4 && (
            <span className="flex items-center justify-center h-6 w-6 rounded-full border border-neutral-800 bg-neutral-900 text-[9px] text-neutral-500">
              +{note.heroes.length - 4}
            </span>
          )}
        </div>
      )}
      <div className="mt-auto pt-3 text-xs text-orange-400 group-hover:text-orange-300 transition">
        Voir les détails →
      </div>
    </Link>
  );

  const renderNewsCard = (item: BlizzardNews) => (
    <Link
      key={`news-${item.id}`}
      href={item.link}
      target="_blank"
      rel="noreferrer noopener"
      className="group relative flex flex-col rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/20 to-neutral-900/30 overflow-hidden transition hover:border-blue-400/50 hover:shadow-lg"
    >
      {item.image_url && (
        <div className="relative h-28 overflow-hidden">
          <Image
            src={item.image_url}
            alt={item.title}
            fill
            className="object-cover transition group-hover:scale-105"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/50 to-transparent" />
        </div>
      )}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium uppercase tracking-wide">
            {item.category || 'News'}
          </span>
          {item.date && <span className="text-neutral-500">{item.date}</span>}
        </div>
        <h3 className="mt-3 text-base font-semibold text-white group-hover:text-blue-200 transition line-clamp-2">
          {item.title}
        </h3>
        <div className="mt-auto pt-3 text-xs text-blue-400 group-hover:text-blue-300 transition">
          Lire l&apos;article →
        </div>
      </div>
    </Link>
  );

  return (
    <section
      id="actualites"
      className="container mt-20 mb-16 lg:mb-24 flex flex-col gap-8 px-4 md:px-0"
    >
      <div className="flex flex-col items-center text-center">
        <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
          Actualités
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-3"
        >
          Overwatch 2
        </Heading>
        <div className="max-w-2xl">
          <Paragraph
            typeStyle="body-lg"
            className="mt-4"
            textColor="text-gray-200"
          >
            Patch notes et actualités officielles depuis Blizzard.
          </Paragraph>
        </div>
      </div>

      {isLoading ? (
        renderLoading()
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Paragraph textColor="text-gray-400">
            Aucune actualité disponible pour le moment.
          </Paragraph>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((item) =>
            item.type === 'patch'
              ? renderPatchCard(item.data)
              : renderNewsCard(item.data)
          )}
        </div>
      )}

      <div className="flex justify-center">
        <Link href="/actualites">
          <Button type="button" className="px-8 h-[52px]">
            Toutes les actualités
          </Button>
        </Link>
      </div>
    </section>
  );
}

export default ActualitesPreviewSection;
