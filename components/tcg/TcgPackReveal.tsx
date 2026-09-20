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
//   - Pour qui a demandé moins de mouvement : les cartes sont posées face
//     visible d'emblée, sans retournement ni halo (cf. le bloc
//     `prefers-reduced-motion` de `globals.css`, ET la séquence ci-dessous qui
//     se saute elle-même). Aucune information ne dépend de l'animation.
//
// LE RETOURNEMENT EST DÉCORATIF, PAS STRUCTUREL. Les cartes arrivent face
// cachée et se retournent l'une après l'autre — mais leur contenu est dans le
// DOM dès le premier rendu. Un lecteur d'écran lit donc le paquet entier sans
// attendre la fin de la séquence, et le dos porte `aria-hidden` +
// `pointer-events: none` : il ne masque ni un lien, ni une cible de clic. La
// seule chose qu'on retarde, c'est ce que l'ŒIL voit.
//
// POURQUOI AUCUNE CARTE FACE CACHÉE N'EST CLIQUABLE. On aurait pu laisser
// retourner une carte au clic. Ce serait un second chemin d'interaction posé
// SUR un lien déjà existant (la carte mène à la fiche de son sujet) : deux
// gestes au même endroit, dont l'un n'existe que pendant deux secondes. Une
// seule commande, donc — « tout révéler » — qui saute la séquence d'un coup.
//
// « NOUVELLE » OU « DOUBLON » EST ÉCRIT, PAS SEULEMENT COLORÉ. Et c'est le
// SERVEUR qui le dit (`isNew`) : la collection étant paginée, la page ne sait
// plus ce qu'on possède déjà. `null` = on ne sait pas ; on n'affiche alors rien
// plutôt qu'un badge faux. Le badge reste dans le DOM pendant que la carte est
// face cachée, mais invisible (`opacity-0`) : l'annoncer tout de suite sert le
// lecteur d'écran, le montrer tout de suite vendrait la mèche.
//
// Aucune chaîne en dur : tout vient de `labels`, fourni par la page hôte.

import { useEffect, useRef, useState, type JSX } from 'react';

import TcgCard, { type TcgCardSubject } from '@/components/tcg/TcgCard';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';

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
    /** Saute la séquence et retourne toutes les cartes d'un coup. */
    revealAll: string;
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

/**
 * Délai entre deux retournements.
 *
 * MESURÉ CONTRE LA DURÉE DU RETOURNEMENT (640 ms, cf. `globals.css`) : plus
 * court, les cartes se chevauchent et la séquence devient un brouillon ; plus
 * long, un paquet de cinq dépasse les trois secondes et on a le temps de
 * s'ennuyer. 260 ms laisse voir chaque carte partir avant que la suivante
 * bouge, pour ~1,9 s au total.
 */
const STAGGER_MS = 260;

/** Avant la première carte : le temps que la grille se pose. */
const LEAD_IN_MS = 220;

/**
 * Le halo joué au retournement, par rareté.
 *
 * Une commune n'a pas à scintiller — la nuance est le message. Les teintes
 * suivent `RARITY_STYLES` de `TcgCard` (bronze, argent, or, platine) pour
 * qu'une légendaire ait la MÊME couleur au retournement et dans la collection.
 */
const RARITY_HALO: Record<TcgRarity, string> = {
  common: 'rgba(180, 83, 9, 0.35)',
  rare: 'rgba(161, 161, 170, 0.45)',
  epic: 'rgba(234, 179, 8, 0.55)',
  legendary: 'rgba(34, 211, 238, 0.65)',
};

export default function TcgPackReveal({
  cards,
  onDismiss,
  labels,
}: TcgPackRevealProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Nombre de cartes déjà retournées, dans l'ordre du paquet. */
  const [flipped, setFlipped] = useState(0);

  useEffect(() => {
    // Focus d'abord (cf. l'en-tête), la séquence ensuite.
    headingRef.current?.focus();

    // MOUVEMENT RÉDUIT : on ne se contente pas de neutraliser l'animation CSS,
    // on saute la séquence. Sans ce test, le CSS poserait bien les cartes face
    // visible, mais l'état React les croirait encore cachées — le bouton
    // « tout révéler » resterait affiché pour une grille déjà révélée.
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || cards.length === 0) {
      setFlipped(cards.length);
      return;
    }

    const timers = cards.map((_, i) =>
      window.setTimeout(
        // `Math.max` : un « tout révéler » a pu passer devant ; une minuterie
        // en retard ne doit jamais REVENIR en arrière et recacher une carte.
        () => setFlipped((n) => Math.max(n, i + 1)),
        LEAD_IN_MS + i * STAGGER_MS
      )
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [cards]);

  const hasDuplicate = cards.some((c) => c.isNew === false);
  const allFlipped = flipped >= cards.length;

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
        <div className="flex flex-wrap items-center gap-2">
          {/* Disparaît une fois tout retourné : un bouton qui ne ferait plus
              rien resterait un piège au clavier. */}
          {!allFlipped && (
            <button
              type="button"
              onClick={() => setFlipped(cards.length)}
              className="min-h-11 rounded-full border border-[var(--color-green)]/40 px-4 py-2 text-sm font-semibold text-[var(--color-green)] transition hover:border-[var(--color-green)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {labels.revealAll}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
          >
            {labels.dismiss}
          </button>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {cards.map((card, i) => {
          const revealed = i < flipped;
          return (
            <li key={card.key} className="tcg-flip">
              {/* Toujours une ligne, même vide : sans elle, les cartes d'une
                  même rangée ne s'aligneraient plus dès qu'une seule porte un
                  badge. Invisible tant que la carte est face cachée — mais
                  présente, donc lue. */}
              <p
                className={`mb-1 flex h-5 items-center justify-center text-[11px] font-bold uppercase tracking-wider transition-opacity duration-300 ${
                  revealed ? 'opacity-100' : 'opacity-0'
                }`}
              >
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

              <div className="tcg-flip-inner" data-revealed={String(revealed)}>
                <div
                  className={`tcg-flip-face rounded-xl ${
                    // Le reflet n'appartient qu'aux brillantes : c'est ce qui
                    // les distingue, et le jouer partout le viderait de sens.
                    card.isFoil ? 'tcg-sheen relative' : ''
                  } tcg-halo`}
                  data-revealed={String(revealed)}
                  style={
                    {
                      '--tcg-halo': RARITY_HALO[card.rarity],
                    } as React.CSSProperties
                  }
                >
                  <TcgCard
                    subject={card.subject}
                    rarity={card.rarity}
                    isFoil={card.isFoil}
                    labels={labels.card}
                  />
                </div>
                {/* Le dos. Décoratif de bout en bout : jamais annoncé, jamais
                    cliquable — il ne fait que cacher, et il laisse passer. */}
                <div
                  className="tcg-flip-back pointer-events-none"
                  aria-hidden
                />
              </div>
            </li>
          );
        })}
      </ul>

      {hasDuplicate && labels.duplicateHint && (
        <p className="mt-4 text-xs text-gray-400">{labels.duplicateHint}</p>
      )}
    </section>
  );
}

/** Exporté pour les tests : l'ordre des raretés doit couvrir tous les halos. */
export const REVEAL_HALO_RARITIES = RARITY_ORDER;
