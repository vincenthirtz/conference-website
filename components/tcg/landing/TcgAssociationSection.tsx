// components/tcg/landing/TcgAssociationSection.tsx
//
// « L'association » : les cartes de la catégorie `association`
// (`tcg_fanart_cards.category = 'association'`) mises en avant avec leur
// DESCRIPTION en entier — la présentation ludique de l'équipe qui fait tourner
// la Cup. Les textes sont rédigés par le staff (colonne `description`) et
// affichés par `TcgCard` lui-même : aucune copie ici.
//
// Des ENTITÉS déposées par le staff, pas des fiches de joueuses : elles ont leur
// place sur une page indexée (cf. l'en-tête de `pages/tcg.tsx`).
//
// Les plus RARES d'abord : la vitrine doit donner envie, et la carte la plus
// convoitée (« Arukdo », rare, par exemple) ne doit pas se perdre au bout.

import type { JSX } from 'react';

import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgCatalog from '@/lib/i18n/locales/fr/tcgCatalog';
import type { TcgRarity } from '@/utils/tcg/rarity';

export type AssociationCardView = {
  id: string;
  name: string | null;
  imageUrl: string | null;
  credit: string | null;
  /** Lien du crédit (le site d'un partenaire), `https://` seulement. */
  creditUrl?: string | null;
  description: string | null;
  rarity: TcgRarity;
};

/** Nombre de cartes mises en avant ; le reste est dans le catalogue. */
export const ASSOCIATION_FEATURED_MAX = 8;

const RARITY_WEIGHT: Record<TcgRarity, number> = {
  legendary: 3,
  epic: 2,
  rare: 1,
  common: 0,
};

/**
 * Les cartes à mettre en avant : les plus rares d'abord, puis celles qui ont une
 * description (c'est elle qui raconte quelqu'un), l'ordre du staff ensuite.
 * Pure et stable, exportée pour être testée.
 */
export function pickFeaturedAssociationCards(
  cards: readonly AssociationCardView[],
  max: number = ASSOCIATION_FEATURED_MAX
): AssociationCardView[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort(
      (a, b) =>
        RARITY_WEIGHT[b.card.rarity] - RARITY_WEIGHT[a.card.rarity] ||
        Number(Boolean(b.card.description?.trim())) -
          Number(Boolean(a.card.description?.trim())) ||
        a.index - b.index
    )
    .slice(0, Math.max(0, max))
    .map(({ card }) => card);
}

export default function TcgAssociationSection({
  cards,
  labels,
  onShowAll,
}: {
  cards: readonly AssociationCardView[];
  labels: TcgCardProps['labels'];
  /** Bascule le catalogue sur le filtre « L'association » (et y descend). */
  onShowAll?: () => void;
}): JSX.Element | null {
  const t = useT(nsTcgCatalog);
  // Aucune carte publiée : pas de section. Un encart vide en haut de page
  // ressemblerait à une promesse non tenue (même règle que le filtre).
  if (cards.length === 0) return null;

  const featured = pickFeaturedAssociationCards(cards);
  const hidden = cards.length - featured.length;

  return (
    <section
      aria-labelledby="tcg-asso-title"
      className="section-brand-bg -mx-4 mt-16 rounded-3xl px-4 py-10 sm:mx-0 sm:px-8"
    >
      <p className="section-eyebrow text-xs uppercase tracking-[0.22em] text-[var(--color-green-light)]">
        {t.assoEyebrow}
      </p>
      <h2 id="tcg-asso-title" className="mt-3 text-2xl font-bold sm:text-3xl">
        {t.assoTitle}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-80">
        {t.assoLede}
      </p>

      {/* Sous `md`, un rang qui défile horizontalement : empilées en pleine
          largeur, huit cartes à description entière faisaient des milliers de
          pixels de haut sur un téléphone. La carte suivante dépasse du bord
          (≈ 72 % de largeur) — c'est l'indice principal qu'on peut faire
          défiler ; la phrase au-dessus le dit pour qui ne le verrait pas.
          Le conteneur est focusable et nommé : au clavier, les flèches le font
          défiler, Tab en sort normalement (aucun piège de focus). À partir de
          `md`, la grille d'origine. */}
      <p className="mt-4 text-xs opacity-70 md:hidden">{t.assoScrollHint}</p>
      <div
        role="region"
        aria-label={t.assoCarouselLabel}
        // Focusable : sans focus, son contenu hors champ est inatteignable au clavier.
        tabIndex={0}
        className="-mx-4 mt-3 overflow-x-auto overscroll-x-contain rounded-xl px-4 pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] md:mx-0 md:mt-6 md:overflow-visible md:px-0 md:pb-0"
      >
        <ul className="flex snap-x snap-mandatory scroll-px-4 items-start gap-4 md:grid md:snap-none md:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {featured.map((card) => (
            <li
              key={card.id}
              className="w-[72%] max-w-xs shrink-0 snap-start md:mx-auto md:w-full"
            >
              <TcgCard
                subject={{
                  kind: 'fanart',
                  fanartId: card.id,
                  name: card.name,
                  imageUrl: card.imageUrl,
                  artistName: card.credit,
                  artistUrl: card.creditUrl ?? null,
                  category: 'association',
                  description: card.description,
                }}
                rarity={card.rarity}
                labels={labels}
                fullDescription
              />
            </li>
          ))}
        </ul>
      </div>

      {hidden > 0 && onShowAll && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-[var(--color-green)] px-5 py-2.5 text-sm font-semibold transition hover:bg-[var(--color-green-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
        >
          {format(t.assoShowAll, { n: cards.length })}
        </button>
      )}
    </section>
  );
}
