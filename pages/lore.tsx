import { useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';

type MediaType = 'comic' | 'story' | 'music' | 'screenshot';

type BlizzardMedia = {
  id: string;
  title: string;
  type: MediaType;
  category: string | null;
  link: string;
  thumbnail_url: string | null;
  description: string | null;
  parts: number;
};

const MEDIA_SOURCE = 'https://overwatch.blizzard.com/fr-fr/media/';

const TYPE_CONFIG: Record<
  MediaType,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    hoverBorder: string;
    shadow: string;
  }
> = {
  comic: {
    label: 'Bande dessinée',
    color: 'text-purple-300',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/30',
    hoverBorder: 'hover:border-purple-400/60',
    shadow: 'hover:shadow-[0_16px_40px_rgba(168,85,247,0.15)]',
  },
  story: {
    label: 'Nouvelle',
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30',
    hoverBorder: 'hover:border-amber-400/60',
    shadow: 'hover:shadow-[0_16px_40px_rgba(245,158,11,0.15)]',
  },
  music: {
    label: 'Musique',
    color: 'text-green-300',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30',
    hoverBorder: 'hover:border-green-400/60',
    shadow: 'hover:shadow-[0_16px_40px_rgba(34,197,94,0.15)]',
  },
  screenshot: {
    label: 'Image',
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-500/20',
    borderColor: 'border-cyan-500/30',
    hoverBorder: 'hover:border-cyan-400/60',
    shadow: 'hover:shadow-[0_16px_40px_rgba(6,182,212,0.15)]',
  },
};

type LorePageProps = {
  media: BlizzardMedia[];
};

export const getStaticProps: GetStaticProps<LorePageProps> = async () => {
  let media: BlizzardMedia[] = [];

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('blizzard_media')
      .select(
        'id, title, type, category, link, thumbnail_url, description, parts'
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) media = data as BlizzardMedia[];
  }

  return {
    props: { media },
    revalidate: 3600,
  };
};

export default function LorePage({ media }: LorePageProps) {
  const [activeTab, setActiveTab] = useState<'all' | MediaType>('all');
  const loading = false;

  const renderSkeleton = (count: number) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
        >
          <div className="h-44 bg-white/10" />
          <div className="p-5 space-y-3">
            <div className="h-3 w-20 rounded bg-white/10" />
            <div className="h-5 w-3/4 rounded bg-white/10" />
            <div className="h-4 w-full rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderMediaCard = (item: BlizzardMedia) => {
    const config = TYPE_CONFIG[item.type];

    return (
      <Link
        key={item.id}
        href={item.link}
        target="_blank"
        rel="noreferrer noopener"
        className={`group relative flex flex-col rounded-2xl border ${config.borderColor} bg-gradient-to-br from-neutral-900/80 to-neutral-950/90 overflow-hidden transition ${config.hoverBorder} ${config.shadow}`}
      >
        {item.thumbnail_url && (
          <div className="relative h-44 overflow-hidden">
            <Image
              src={item.thumbnail_url}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition group-hover:scale-105"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
            {item.parts > 1 && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 text-xs text-white font-medium backdrop-blur-sm">
                {item.parts} parties
              </div>
            )}
          </div>
        )}
        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span
              className={`px-2.5 py-1 rounded-full ${config.bgColor} ${config.color} font-medium uppercase tracking-wide`}
            >
              {config.label}
            </span>
            {item.category && item.category !== config.label && (
              <span className="text-neutral-400">{item.category}</span>
            )}
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-white/90 transition line-clamp-2">
            {item.title}
          </h3>
          {item.description && (
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed line-clamp-3">
              {item.description}
            </p>
          )}
          <div
            className={`mt-auto pt-4 flex items-center gap-2 text-sm ${config.color} transition`}
          >
            <span>
              {item.type === 'comic'
                ? 'Lire la BD'
                : item.type === 'story'
                  ? 'Lire la nouvelle'
                  : item.type === 'music'
                    ? 'Écouter'
                    : 'Voir les images'}
            </span>
            <span className="transition transform group-hover:translate-x-1">
              →
            </span>
          </div>
        </div>
      </Link>
    );
  };

  const filteredItems =
    activeTab === 'all' ? media : media.filter((m) => m.type === activeTab);

  // Compter par type
  const counts = media.reduce(
    (acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    },
    {} as Record<MediaType, number>
  );

  const tabs: { key: 'all' | MediaType; label: string }[] = [
    { key: 'all', label: 'Tout' },
    { key: 'comic', label: 'BD' },
    { key: 'story', label: 'Nouvelles' },
    { key: 'music', label: 'Musique' },
    { key: 'screenshot', label: 'Images' },
  ];

  return (
    <>
      <Head>
        <title>Lore & Médias Overwatch | OW World Cup</title>
        <meta
          name="description"
          content="Découvrez l'univers d'Overwatch : bandes dessinées, nouvelles, musiques et images officielles de Blizzard."
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
        <div className="container mx-auto px-4 pt-28 pb-16">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-block text-lg text-white font-semibold border-b-2 border-purple-400 mb-4">
              Univers & Lore
            </div>
            <Heading typeStyle="heading-lg" className="text-gradient">
              Médias Overwatch
            </Heading>
            <div className="max-w-2xl mx-auto mt-4">
              <Paragraph typeStyle="body-lg" textColor="text-neutral-300">
                Plongez dans l&apos;univers d&apos;Overwatch avec les bandes
                dessinées, nouvelles, musiques et visuels officiels de Blizzard.
              </Paragraph>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {tabs.map((tab) => {
              const count =
                tab.key === 'all' ? media.length : counts[tab.key] || 0;
              const config = tab.key !== 'all' ? TYPE_CONFIG[tab.key] : null;

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === tab.key
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                  {!loading && count > 0 && (
                    <span
                      className={`ml-2 text-xs ${config ? config.color : 'text-neutral-500'}`}
                    >
                      ({count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {loading ? (
            renderSkeleton(6)
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20">
              <Paragraph textColor="text-neutral-400" className="text-lg">
                Aucun média disponible pour le moment.
              </Paragraph>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => renderMediaCard(item))}
            </div>
          )}

          {/* Link to Blizzard */}
          <div className="mt-16 flex justify-center">
            <Link href={MEDIA_SOURCE} target="_blank" rel="noreferrer">
              <Button
                type="button"
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500"
              >
                Voir tous les médias sur Blizzard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
