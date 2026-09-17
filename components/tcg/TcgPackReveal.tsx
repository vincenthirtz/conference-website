// components/tcg/TcgPackReveal.tsx
//
// La révélation d'un paquet qu'on vient d'ouvrir.
//
// C'EST LE MOMENT DU TCG, ET IL DOIT L'ÊTRE POUR TOUT LE MONDE.
//   - Au clavier et au lecteur d'écran : le focus est porté sur le titre de la
//     révélation dès qu'elle apparaît. Sans cela, la personne qui vient
//     d'activer « Ouvrir » reste sur un bouton qui a disparu (le paquet n'est
//     plus fermé) et le focus retombe en haut du document — elle ne saurait
//     même pas que quelque chose s'est ouvert. L'ANNONCE de ce qui a été
//     obtenu, elle, appartient à la page hôte : une région `aria-live` doit
//     exister AVANT que son contenu change, ce qu'un composant monté à
//     l'instant ne peut pas garantir.
//   - Pour qui a demandé moins de mouvement : les cartes apparaissent l'une
//     après l'autre (un léger décalage, pas un retournement en 3D), et
//     `motion-reduce:` les pose toutes d'emblée. Aucune information ne dépend
//     de l'animation — elle ne fait que rythmer ce qui est déjà affiché.
//
// « NOUVELLE » OU « DOUBLON » EST ÉCRIT, PAS SEULEMENT COLORÉ. Et c'est le
// SERVEUR qui le dit (`isNew`) : la collection étant paginée, la page ne sait
// plus ce qu'on possède déjà. `null` = on ne sait pas ; on n'affiche alors rien
// plutôt qu'un badge faux.
//
// Aucune chaîne en dur : tout vient de `labels`, fourni par la page hôte.

import { useEffect, useRef, useState, type JSX } from 'react';

import TcgCard, { type TcgCardSubject } from '@/components/tcg/TcgCard';
import type { TcgRarity } from '@/utils/tcg/rarity';

export type TcgRevealCard = {
  /** Clé stable dans le paquet (sa position). */
  key: string;
  subject: TcgCardSubject;
  rarity: TcgRarity;
  isFoil: boolean;
  /** `true` nouvelle, `false` doublon, `null` inconnu (rien d'affiché). */
  isNew: boolean | null;
};

export type TcgPackRevealProps = {
  cards: TcgRevealCard[];
  onDismiss: () => void;
  labels: {
    title: string;
    subtitle: string;
    /** Résumé visible, déjà formulé par la page (pluriel compris). */
    summary: string | null;
    /** Aide affichée seulement s'il y a au moins un doublon connu. */
    duplicateHint: string | null;
    dismiss: string;
    newCard: string;
    duplicate: string;
    card: {
      rarity: Record<TcgRarity, string>;
      foil: string;
      copies: string;
      /** Gabarit du crédit de logo ; absent ⇒ aucun crédit (cf. `TcgCard`). */
      logoCredit?: string;
    };
  };
};

/** Décalage entre deux cartes. Assez pour qu'on les suive, pas pour attendre. */
const STAGGER_MS = 140;

export default function TcgPackReveal({
  cards,
  onDismiss,
  labels,
}: TcgPackRevealProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Focus d'abord (cf. l'en-tête), puis l'apparition à la frame suivante :
    // un changement de classe dans la même frame que le montage ne déclenche
    // aucune transition, les cartes surgiraient d'un bloc.
    headingRef.current?.focus();
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const hasDuplicate = cards.some((c) => c.isNew === false);

  return (
    <section
      aria-labelledby="tcg-reveal-title"
      className="mt-8 rounded-2xl border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/[0.07] p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="tcg-reveal-title"
            ref={headingRef}
            // Cible de focus programmatique seulement : pas dans l'ordre de
            // tabulation, mais un contour visible quand on y arrive au clavier.
            tabIndex={-1}
            className="scroll-mt-24 rounded text-lg font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
          >
            {labels.title}
          </h2>
          <p className="mt-1 text-sm text-gray-300">
            {labels.summary ?? labels.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
        >
          {labels.dismiss}
        </button>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {cards.map((card, i) => (
          <li
            key={card.key}
            style={{ transitionDelay: shown ? `${i * STAGGER_MS}ms` : '0ms' }}
            className={`transition duration-500 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
              shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            }`}
          >
            {/* Toujours une ligne, même vide : sans elle, les cartes d'une même
                rangée ne s'aligneraient plus dès qu'une seule porte un badge. */}
            <p className="mb-1 flex h-5 items-center justify-center text-[11px] font-bold uppercase tracking-wider">
              {card.isNew === true && (
                <span className="rounded-full bg-[var(--color-green)]/15 px-2 text-[var(--color-green)]">
                  {labels.newCard}
                </span>
              )}
              {card.isNew === false && (
                <span className="rounded-full bg-white/10 px-2 text-gray-300">
                  {labels.duplicate}
                </span>
              )}
            </p>
            <TcgCard
              subject={card.subject}
              rarity={card.rarity}
              isFoil={card.isFoil}
              labels={labels.card}
            />
          </li>
        ))}
      </ul>

      {hasDuplicate && labels.duplicateHint && (
        <p className="mt-4 text-xs text-gray-400">{labels.duplicateHint}</p>
      )}
    </section>
  );
}
