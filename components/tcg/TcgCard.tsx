// components/tcg/TcgCard.tsx
//
// Une carte du TCG : une joueuse ou une équipe.
//
// LES COULEURS DE RARETÉ SONT CELLES DES BADGES DU PROFIL, pas une palette
// inventée. `BADGE_TIER_STYLES` (fiche joueuse) habille déjà bronze / silver /
// gold / platinum, et mon barème fait correspondre exactement `common` /
// `rare` / `epic` / `legendary` à ces quatre paliers. Une seconde palette
// aurait donné des couleurs contradictoires sur le profil de la MÊME joueuse —
// le travers que `utils/tcg/rarity.ts` évite déjà côté calcul.
//
// AUCUNE IMAGE GÉNÉRÉE. Sans photo consentie ni avatar, la carte affiche un
// fond de marque et l'initiale du nom. Le projet n'utilise pas d'imagerie IA,
// et un portrait inventé pour représenter une personne réelle serait pire
// qu'un aplat.
//
// LE `foil` EST UN REFLET, PAS UN CINQUIÈME PALIER. Il se superpose à la
// rareté sans la modifier — sinon le barème cesserait de dire la vérité sur le
// parcours de la joueuse (cf. `FOIL_CHANCE`).

import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';
import type { TcgRarity } from '@/utils/tcg/rarity';

/**
 * Habillage par rareté, aligné sur `BADGE_TIER_STYLES` de la fiche joueuse :
 * common↔bronze, rare↔silver, epic↔gold, legendary↔platinum.
 */
const RARITY_STYLES: Record<TcgRarity, string> = {
  common: 'border-amber-700/50 bg-amber-700/10',
  rare: 'border-zinc-400/40 bg-zinc-400/10',
  epic: 'border-yellow-500/40 bg-yellow-500/10',
  legendary: 'border-cyan-400/40 bg-cyan-400/10',
};

const RARITY_TEXT: Record<TcgRarity, string> = {
  common: 'text-amber-300',
  rare: 'text-zinc-200',
  epic: 'text-yellow-300',
  legendary: 'text-cyan-200',
};

export type TcgCardSubject =
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
    }
  | {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
    };

export type TcgCardProps = {
  subject: TcgCardSubject;
  rarity: TcgRarity;
  isFoil?: boolean;
  /** Nombre d'exemplaires possédés ; masqué si absent ou égal à 1. */
  count?: number;
  /** Libellés traduits, fournis par la page hôte. */
  labels: {
    rarity: Record<TcgRarity, string>;
    foil: string;
    copies: string;
  };
};

function initial(name: string | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export default function TcgCard({
  subject,
  rarity,
  isFoil = false,
  count,
  labels,
}: TcgCardProps): JSX.Element {
  const name =
    subject.kind === 'player' ? subject.displayName : (subject.name ?? null);
  const imageUrl =
    subject.kind === 'player' ? subject.imageUrl : subject.logoUrl;
  const href =
    subject.kind === 'player'
      ? `/player/${subject.userId}`
      : subject.slug
        ? // `/team/` au SINGULIER : c'est la route publique réelle
          // (pages/team/[slug]/index.tsx). Le pluriel menait à un 404 sur
          // chaque carte d'équipe.
          `/team/${subject.slug}`
        : null;

  const inner = (
    <>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-[var(--color-violet)]/25 to-[var(--color-green)]/15">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 180px"
            className={
              subject.kind === 'team' ? 'object-contain p-4' : 'object-cover'
            }
            unoptimized
          />
        ) : (
          // Ni photo consentie ni avatar : un aplat de marque et l'initiale.
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-4xl font-black text-white/70"
          >
            {initial(name)}
          </span>
        )}

        {isFoil && (
          // Reflet purement décoratif, superposé à la rareté.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent mix-blend-screen"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-white">
          {name ?? '—'}
        </p>
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${RARITY_TEXT[rarity]}`}
        >
          {labels.rarity[rarity]}
          {isFoil ? ` · ${labels.foil}` : ''}
        </p>
        {typeof count === 'number' && count > 1 && (
          <p className="text-[11px] text-gray-400">
            {labels.copies.replace('{count}', String(count))}
          </p>
        )}
      </div>
    </>
  );

  const shell = `card-brand group flex flex-col overflow-hidden rounded-xl border ${RARITY_STYLES[rarity]} transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:transform-none`;

  // Une carte dont le sujet n'a pas de page publique reste une carte : on la
  // rend sans lien plutôt que de fabriquer une URL qui mènerait à un 404.
  return href ? (
    <Link
      href={href}
      className={`${shell} focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]`}
    >
      {inner}
    </Link>
  ) : (
    <article className={shell}>{inner}</article>
  );
}
