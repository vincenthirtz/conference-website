import Link from 'next/link';
import { useEffect, useState, JSX } from 'react';
import Button from '@/components/Buttons/button';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { useT } from '@/lib/i18n/useT';

import { logger } from '../../utils/logger';
type PatchNote = {
  id: string;
  title: string;
  date: string;
  link: string;
  summary: string;
  heroes: { name: string; icon: string; summary: string; category: string }[];
};

const PATCH_NOTES_SOURCE =
  'https://overwatch.blizzard.com/fr-fr/news/patch-notes/';

function PatchNotesSection(): JSX.Element {
  const t = useT('patchNotesSection');
  const [notes, setNotes] = useState<PatchNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchNotes = async () => {
      try {
        const response = await fetch('/api/patch-notes');

        if (!response.ok) {
          throw new Error('Failed to fetch patch notes');
        }

        const data = (await response.json()) as {
          items?: PatchNote[];
          error?: string;
        };

        if (!isMounted) {
          return;
        }

        if (data?.items) {
          setNotes(data.items);
        } else if (data?.error) {
          setError(data.error);
        }
      } catch (err) {
        logger.error('Failed to load patch notes', err);
        if (isMounted) {
          setError(t.errLoad);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchNotes();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement au montage uniquement (garde isMounted) ; t.errLoad n'est lu qu'au moment de l'erreur, pas réactif
  }, []);

  const renderLoading = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[...Array(4).keys()].map((skeleton) => (
        <div
          key={skeleton}
          className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-5"
        >
          <div className="h-3 w-24 rounded-full bg-white/10" />
          <div className="mt-4 h-6 w-3/4 rounded bg-white/10" />
          <div className="mt-2 h-6 w-2/3 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    if (isLoading) {
      return renderLoading();
    }

    if (error || notes.length === 0) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Paragraph textColor="text-gray-200" className="text-lg">
            {error || t.unavailable}
          </Paragraph>
          <Paragraph textColor="text-gray-400" className="mt-2">
            {t.checkOfficial}
          </Paragraph>
          <div className="mt-5 flex justify-center">
            <Link
              href={PATCH_NOTES_SOURCE}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Button type="button" className="px-6 h-[50px]">
                {t.seePatchNotes}
              </Button>
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {notes.map((note) => {
          const groupedHeroes = note.heroes?.reduce<
            Record<string, typeof note.heroes>
          >((acc, hero) => {
            const key = hero.category || t.categoryFallback;
            if (!acc[key]) acc[key] = [];
            acc[key].push(hero);
            return acc;
          }, {});

          return (
            <Link
              key={note.id}
              href={note.link}
              target="_blank"
              rel="noreferrer noopener"
              className="group relative flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 p-5 transition duration-200 hover:border-blue-300/70 hover:shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
            >
              <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wide">
                <span className="text-blue-200/80">{t.patchNotesLabel}</span>
                <span className="text-gray-300">{note.date}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white transition group-hover:text-blue-100">
                {note.title}
              </h3>
              <Paragraph
                textColor="text-gray-200"
                className="mt-3 text-sm leading-relaxed"
              >
                {note.summary}
              </Paragraph>
              {groupedHeroes && note.heroes && note.heroes.length > 0 && (
                <div className="mt-3 space-y-3">
                  {Object.entries(groupedHeroes).map(([category, heroes]) => (
                    <div key={`${note.id}-${category}`} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="h-6 border-l-4 border-blue-300" />
                        <span className="text-xs uppercase tracking-wide text-blue-100">
                          {category}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-3 border-l border-white/10">
                        {heroes.map((hero) => (
                          <div
                            key={`${note.id}-${category}-${hero.name}`}
                            className="group/hero relative flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1"
                          >
                            {hero.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={hero.icon}
                                alt={hero.name}
                                className="h-8 w-8 rounded-full object-contain bg-white/10"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-white/10" />
                            )}
                            <span className="text-sm text-white">
                              {hero.name}
                            </span>
                            <div className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-2 hidden w-72 -translate-x-1/2 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs leading-relaxed text-gray-100 shadow-lg group-hover/hero:block">
                              {hero.summary}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-center gap-2 pt-4 text-sm text-blue-200 transition group-hover:text-blue-100">
                <span>{t.readOn}</span>
                <span
                  aria-hidden
                  className="transition transform group-hover:translate-x-1"
                >
                  →
                </span>
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/5 opacity-0 transition group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <section
      id="actualites"
      className="container mt-20 mb-16 lg:mb-24 flex flex-col gap-8 px-4 md:px-0"
    >
      <div className="flex flex-col items-center text-center">
        <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
          {t.eyebrow}
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-3"
        >
          {t.title}
        </Heading>
        <div className="max-w-2xl">
          <Paragraph
            typeStyle="body-lg"
            className="mt-4"
            textColor="text-gray-200"
          >
            {t.subtitle}
          </Paragraph>
        </div>
      </div>

      {renderContent()}

      {notes.length > 0 && (
        <div className="flex justify-center">
          <Link
            href={PATCH_NOTES_SOURCE}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Button type="button" className="px-8 h-[52px]">
              {t.seeMore}
            </Button>
          </Link>
        </div>
      )}
    </section>
  );
}

export default PatchNotesSection;
