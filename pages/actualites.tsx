import { useState } from 'react';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';

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

type ActualitesProps = {
  patchNotes: PatchNote[];
  news: BlizzardNews[];
};

const PATCH_NOTES_SOURCE =
  'https://overwatch.blizzard.com/fr-fr/news/patch-notes/';
const NEWS_SOURCE = 'https://overwatch.blizzard.com/fr-fr/news/';

export const getStaticProps: GetStaticProps<ActualitesProps> = async () => {
  let patchNotes: PatchNote[] = [];
  let news: BlizzardNews[] = [];

  if (supabaseAdmin) {
    const [patchRes, newsRes] = await Promise.all([
      supabaseAdmin
        .from('patch_notes')
        .select('id, title, date, link, summary, heroes')
        .order('date_parsed', { ascending: false, nullsFirst: false })
        .limit(4),
      supabaseAdmin
        .from('blizzard_news')
        .select('id, title, date, link, image_url, category, summary')
        .order('date_parsed', { ascending: false, nullsFirst: false })
        .limit(12),
    ]);

    if (!patchRes.error && patchRes.data) {
      patchNotes = patchRes.data.map((row) => ({
        id: row.id,
        title: row.title,
        date: row.date,
        link: row.link,
        summary: row.summary || '',
        heroes: (row.heroes as PatchNote['heroes']) || [],
      }));
    }

    if (!newsRes.error && newsRes.data) {
      news = newsRes.data.map((row) => ({
        id: row.id,
        title: row.title,
        date: row.date,
        link: row.link,
        image_url: row.image_url,
        category: row.category,
        summary: row.summary || '',
      }));
    }
  }

  return {
    props: { patchNotes, news },
    revalidate: 900, // 15 minutes
  };
};

function ActualitesPage({ patchNotes, news }: ActualitesProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'patch' | 'news'>('all');

  const renderPatchNoteCard = (note: PatchNote) => {
    const groupedHeroes = note.heroes?.reduce<Record<string, typeof note.heroes>>(
      (acc, hero) => {
        const key = hero.category || 'Autres';
        if (!acc[key]) acc[key] = [];
        acc[key].push(hero);
        return acc;
      },
      {}
    );

    return (
      <Link
        key={`patch-${note.id}`}
        href={note.link}
        target="_blank"
        rel="noreferrer noopener"
        className="group relative flex flex-col rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-950/30 to-neutral-900/50 overflow-hidden transition hover:border-orange-400/60 hover:shadow-[0_16px_40px_rgba(249,115,22,0.15)]"
      >
        <div className="p-5 flex flex-col h-full">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 font-medium uppercase tracking-wide">
              Patch Notes
            </span>
            <span className="text-neutral-400">{note.date}</span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-orange-200 transition line-clamp-2">
            {note.title}
          </h3>
          <p className="mt-3 text-sm text-neutral-300 leading-relaxed line-clamp-3">
            {note.summary}
          </p>

          {groupedHeroes && Object.keys(groupedHeroes).length > 0 && (
            <div className="mt-4 space-y-2">
              {Object.entries(groupedHeroes)
                .slice(0, 2)
                .map(([category, heroes]) => (
                  <div key={category} className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-orange-300/70">
                      {category}:
                    </span>
                    <div className="flex -space-x-2">
                      {heroes.slice(0, 5).map((hero) =>
                        hero.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={hero.name}
                            src={hero.icon}
                            alt={hero.name}
                            title={hero.name}
                            className="h-7 w-7 rounded-full border-2 border-neutral-900 object-contain bg-white/10"
                          />
                        ) : null
                      )}
                      {heroes.length > 5 && (
                        <span className="flex items-center justify-center h-7 w-7 rounded-full border-2 border-neutral-900 bg-neutral-800 text-[10px] text-neutral-400">
                          +{heroes.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="mt-auto pt-4 flex items-center gap-2 text-sm text-orange-300 group-hover:text-orange-200 transition">
            <span>Lire les détails</span>
            <span className="transition transform group-hover:translate-x-1">→</span>
          </div>
        </div>
      </Link>
    );
  };

  const renderNewsCard = (item: BlizzardNews) => (
    <Link
      key={`news-${item.id}`}
      href={item.link}
      target="_blank"
      rel="noreferrer noopener"
      className="group relative flex flex-col rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/30 to-neutral-900/50 overflow-hidden transition hover:border-blue-400/60 hover:shadow-[0_16px_40px_rgba(59,130,246,0.15)]"
    >
      {item.image_url && (
        <div className="relative h-40 overflow-hidden">
          <Image
            src={item.image_url}
            alt={item.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition group-hover:scale-105"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent" />
        </div>
      )}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 font-medium uppercase tracking-wide">
            {item.category || 'Actualité'}
          </span>
          {item.date && <span className="text-neutral-400">{item.date}</span>}
        </div>
        <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-blue-200 transition line-clamp-2">
          {item.title}
        </h3>
        {item.summary && (
          <p className="mt-3 text-sm text-neutral-300 leading-relaxed line-clamp-3">
            {item.summary}
          </p>
        )}
        <div className="mt-auto pt-4 flex items-center gap-2 text-sm text-blue-300 group-hover:text-blue-200 transition">
          <span>Lire l&apos;article</span>
          <span className="transition transform group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );

  const allItems = [
    ...patchNotes.map((p) => ({ type: 'patch' as const, data: p, date: p.date })),
    ...news.map((n) => ({ type: 'news' as const, data: n, date: n.date })),
  ];

  const filteredItems =
    activeTab === 'all'
      ? allItems
      : activeTab === 'patch'
        ? allItems.filter((i) => i.type === 'patch')
        : allItems.filter((i) => i.type === 'news');

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
        <div className="container mx-auto px-4 pt-28 pb-16">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-block text-lg text-white font-semibold border-b-2 border-blue-400 mb-4">
              Actualités
            </div>
            <Heading typeStyle="heading-lg" level="h1" className="text-gradient">
              Actualités Overwatch
            </Heading>
            <div className="max-w-2xl mx-auto mt-4">
              <Paragraph typeStyle="body-lg" textColor="text-neutral-300">
                Patch notes, mises à jour et actualités officielles directement
                depuis Blizzard.
              </Paragraph>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex justify-center gap-2 mb-10">
            {[
              { key: 'all', label: 'Tout' },
              { key: 'patch', label: 'Patch Notes' },
              { key: 'news', label: 'Actualités' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition ${
                  activeTab === tab.key
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
                {tab.key === 'patch' && (
                  <span className="ml-2 text-xs text-orange-400">
                    ({patchNotes.length})
                  </span>
                )}
                {tab.key === 'news' && (
                  <span className="ml-2 text-xs text-blue-400">
                    ({news.length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-20">
              <Paragraph textColor="text-neutral-400" className="text-lg">
                Aucune actualité disponible pour le moment.
              </Paragraph>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) =>
                item.type === 'patch'
                  ? renderPatchNoteCard(item.data as PatchNote)
                  : renderNewsCard(item.data as BlizzardNews)
              )}
            </div>
          )}

          {/* Links to Blizzard */}
          <div className="mt-16 flex flex-col sm:flex-row justify-center gap-4">
            <Link href={PATCH_NOTES_SOURCE} target="_blank" rel="noreferrer">
              <Button
                type="button"
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500"
              >
                Tous les Patch Notes
              </Button>
            </Link>
            <Link href={NEWS_SOURCE} target="_blank" rel="noreferrer">
              <Button
                type="button"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500"
              >
                Toutes les Actualités
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

const actualitesSeo: SeoProps = {
  title: 'Actualités Overwatch',
  description:
    "Dernières actualités, patch notes et mises à jour d'Overwatch par Blizzard.",
};

ActualitesPage.seo = actualitesSeo;

export default ActualitesPage;
