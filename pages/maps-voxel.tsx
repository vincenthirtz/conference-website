// pages/maps-voxel.tsx
//
// Vitrine interne des maquettes voxel du map pool (cf. utils/maps/*).
//
// WHY: le remplacement des captures d'écran d'éditeur par des maquettes
// générées est une décision qui se juge à l'œil. Cette page met les trente
// maquettes côte à côte avec leur recette, pour que l'équipe tranche sur pièces.
//
// `noindex` : c'est une page d'atelier, pas une page de marque. Elle est
// publique pour être partageable d'un simple lien, mais n'a rien à faire dans
// les résultats de recherche.
//
// Le catalogue est résolu dans `getStaticProps` — surtout PAS à l'import du
// composant : `@/config/maps` tire `generateScene` et donc tout le moteur
// (builder, layouts, silhouettes, props), qui n'a rien à faire dans le bundle
// client d'une page qui n'affiche que des fichiers déjà rendus.

import { useMemo, useState } from 'react';
import { statSync } from 'node:fs';
import path from 'node:path';
import type { GetStaticProps } from 'next';

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { format, useT } from '@/lib/i18n/useT';
import nsMapsVoxel from '@/lib/i18n/locales/fr/mapsVoxelPage';

type Dict = typeof nsMapsVoxel.fr;

type VoxelMap = {
  slug: string;
  name: string;
  layout: string;
  architecture: string;
  environment: string | null;
  mood: string;
  landmarks: string[];
  palette: string[];
  /** Poids du SVG servi, en kilo-octets. */
  weightKb: number;
};

type Props = { maps: VoxelMap[] };

const MODE_ORDER = ['control', 'escort', 'hybrid', 'push', 'flashpoint', 'standard'] as const;

const modeLabel = (t: Dict, layout: string): string =>
  ({
    control: t.modeControl,
    escort: t.modeEscort,
    hybrid: t.modeHybrid,
    push: t.modePush,
    flashpoint: t.modeFlashpoint,
    standard: t.modeStandard,
  })[layout] ?? layout;

const archLabel = (t: Dict, architecture: string): string =>
  ({
    modern: t.archModern,
    terrace: t.archTerrace,
    whitewash: t.archWhitewash,
    industrial: t.archIndustrial,
    ancient: t.archAncient,
    colonial: t.archColonial,
    tiered: t.archTiered,
    futurist: t.archFuturist,
    alpine: t.archAlpine,
  })[architecture] ?? architecture;

const envLabel = (t: Dict, environment: string): string =>
  ({ sea: t.envSea, sand: t.envSand, snow: t.envSnow, grass: t.envGrass, lava: t.envLava })[
    environment
  ] ?? environment;

const moodLabel = (t: Dict, mood: string): string =>
  ({ day: t.moodDay, dusk: t.moodDusk, night: t.moodNight })[mood] ?? mood;

function MapCard({ map, t }: { map: VoxelMap; t: Dict }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition hover:border-purple-400/40 hover:bg-white/[0.06]">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/40">
        {/* SVG statique déjà rendu : pas de next/image (il n'optimise pas le SVG). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/img/maps/overwatch/${map.slug}.svg`}
          alt={map.name}
          width={800}
          height={500}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-white">{map.name}</h2>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-gray-500">
            {map.weightKb} ko
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded border border-purple-400/40 px-1.5 py-0.5 text-[11px] text-purple-200">
            {modeLabel(t, map.layout)}
          </span>
          <span className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-gray-300">
            {archLabel(t, map.architecture)}
          </span>
          {map.environment ? (
            <span className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-gray-300">
              {envLabel(t, map.environment)}
            </span>
          ) : null}
          <span className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-gray-300">
            {moodLabel(t, map.mood)}
          </span>
        </div>

        <div className="flex items-center gap-1.5" aria-label={t.labelPalette}>
          {map.palette.map((color) => (
            <span
              key={color}
              className="h-4 w-4 rounded-sm border border-white/20"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <span className="ml-auto flex flex-wrap justify-end gap-1">
            {map.landmarks.map((landmark) => (
              <span key={landmark} className="font-mono text-[10px] text-gray-500">
                {landmark}
              </span>
            ))}
          </span>
        </div>
      </div>
    </article>
  );
}

function MapsVoxelPage({ maps }: Props) {
  const t = useT(nsMapsVoxel);
  const [mode, setMode] = useState<string>('all');

  const modes = useMemo(
    () => MODE_ORDER.filter((m) => maps.some((map) => map.layout === m)),
    [maps]
  );
  const shown = useMemo(
    () => (mode === 'all' ? maps : maps.filter((map) => map.layout === mode)),
    [maps, mode]
  );

  const steps = [
    { title: t.howStep1Title, body: t.howStep1Body },
    { title: t.howStep2Title, body: t.howStep2Body },
    { title: t.howStep3Title, body: t.howStep3Body },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d0b14] via-[#120f1c] to-[#0d0b14]">
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4">
          <p className="text-xs uppercase tracking-[0.22em] text-purple-300">{t.eyebrow}</p>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">{t.title}</h1>
          <p className="max-w-3xl text-gray-300">{t.lede}</p>
          <p className="max-w-3xl text-sm text-gray-400">{t.posture}</p>
        </header>

        <nav className="mt-10 flex flex-wrap items-center gap-2" aria-label={t.filterAll}>
          <button
            type="button"
            onClick={() => setMode('all')}
            aria-pressed={mode === 'all'}
            className={`rounded-full border px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
              mode === 'all'
                ? 'border-purple-400 bg-purple-500/20 text-white'
                : 'border-white/15 text-gray-300 hover:border-white/30 hover:text-white'
            }`}
          >
            {t.filterAll}
          </button>
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-full border px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                mode === m
                  ? 'border-purple-400 bg-purple-500/20 text-white'
                  : 'border-white/15 text-gray-300 hover:border-white/30 hover:text-white'
              }`}
            >
              {modeLabel(t, m)}
            </button>
          ))}
          <span className="ml-auto font-mono text-xs tabular-nums text-gray-500">
            {format(t.countMaps, { n: shown.length })}
          </span>
        </nav>

        <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((map) => (
            <MapCard key={map.slug} map={map} t={t} />
          ))}
        </section>

        <p className="mt-6 text-xs text-gray-500">{t.vocabularyNote}</p>

        <section className="mt-16 border-t border-white/10 pt-10">
          <h2 className="text-2xl font-bold text-white">{t.howTitle}</h2>
          <ol className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span className="font-mono text-xs text-purple-300">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                <p className="text-sm text-gray-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { getGame } = await import('@/config/games');
  const { getMapRecipe } = await import('@/config/maps');

  const pool = getGame('overwatch')?.mapPool ?? [];
  const maps: VoxelMap[] = pool.map((entry) => {
    const recipe = getMapRecipe('overwatch', entry.name, entry.type);
    let weightKb = 0;
    try {
      const file = path.join(process.cwd(), 'public', 'img', 'maps', 'overwatch', `${recipe.slug}.svg`);
      weightKb = Math.round(statSync(file).size / 1024);
    } catch {
      // Maquette pas encore rendue (npm run maps:render) : on affiche 0 plutôt
      // que de faire échouer le build de toute la page.
      weightKb = 0;
    }
    return {
      slug: recipe.slug,
      name: recipe.name,
      layout: recipe.layout,
      architecture: recipe.architecture ?? 'modern',
      environment: recipe.environment?.kind ?? null,
      mood: recipe.mood ?? 'day',
      landmarks: [...recipe.landmarks],
      palette: [...recipe.palette],
      weightKb,
    };
  });

  return { props: { maps } };
};

const mapsVoxelSeo: SeoProps = {
  title: {
    fr: 'Maquettes voxel du map pool — atelier',
    en: 'Voxel map-pool models — workshop',
  },
  description: {
    fr: "Les trente maps du pool Overwatch en maquettes voxel générées maison, à la place des captures d'écran d'éditeur.",
    en: 'The thirty Overwatch pool maps as in-house generated voxel models, replacing publisher screenshots.',
  },
  noindex: true,
};

MapsVoxelPage.seo = mapsVoxelSeo;

export default MapsVoxelPage;
