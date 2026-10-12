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
//     l'instant ne peut pas garantir. Même règle quand une commande de la
//     révélation disparaît sous le doigt (« Ouvrir le paquet », « Tout
//     révéler ») : le focus revient au titre au lieu de tomber dans le vide.
//   - Pour qui a demandé moins de mouvement : pas de sachet, pas de
//     déchirure, pas d'éventail — les cartes sont posées face visible
//     d'emblée, sans retournement ni halo (cf. le bloc `prefers-reduced-motion`
//     de `globals.css`, ET la séquence ci-dessous qui se saute elle-même).
//     Aucune information ne dépend de l'animation.
//
// LA SÉQUENCE : sachet scellé → déchirure → éventail → retournements. Son
// ordre et son calendrier vivent dans `utils/tcg/packRevealSequence.ts`
// (testés sans DOM) ; ce composant ne fait que programmer les minuteries et
// dessiner la phase courante (`data-phase`, lu par le CSS).
//
// LE SACHET ET LE RETOURNEMENT SONT DÉCORATIFS, PAS STRUCTURELS. Les cartes
// sont dans le DOM dès le premier rendu — sous le sachet, invisibles mais
// présentes. Un lecteur d'écran lit donc le paquet entier sans attendre la fin
// de la séquence, et le dos porte `aria-hidden` + `pointer-events: none` : il
// ne masque ni un lien, ni une cible de clic. La seule chose qu'on retarde,
// c'est ce que l'ŒIL voit.
//
// POURQUOI AUCUNE CARTE FACE CACHÉE N'EST CLIQUABLE. On aurait pu laisser
// retourner une carte au clic. Ce serait un second chemin d'interaction posé
// SUR un lien déjà existant (la carte mène à la fiche de son sujet) : deux
// gestes au même endroit, dont l'un n'existe que pendant deux secondes. Une
// seule commande, donc — « tout révéler » — qui saute la séquence ENTIÈRE,
// déchirure comprise, d'un coup.
//
// « NOUVELLE » OU « DOUBLON » EST ÉCRIT, PAS SEULEMENT COLORÉ. Et c'est le
// SERVEUR qui le dit (`isNew`) : la collection étant paginée, la page ne sait
// plus ce qu'on possède déjà. `null` = on ne sait pas ; on n'affiche alors rien
// plutôt qu'un badge faux. Le badge reste dans le DOM pendant que la carte est
// face cachée, mais invisible (`opacity-0`) : l'annoncer tout de suite sert le
// lecteur d'écran, le montrer tout de suite vendrait la mèche.
//
// Aucune chaîne en dur : tout vient de `labels`, fourni par la page hôte.

import {
  useEffect,
  useReducer,
  useRef,
  type CSSProperties,
  type JSX,
} from 'react';

import TcgCard, { type TcgCardSubject } from '@/components/tcg/TcgCard';
import TcgPackSachet from '@/components/tcg/TcgPackSachet';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';
import {
  BURST_MS,
  TEAR_MS,
  flipTimeline,
  initialRevealState,
  revealReducer,
} from '@/utils/tcg/packRevealSequence';

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
    /** Nom accessible (et texte visible) du sachet scellé. */
    openPack: string;
    /** Aide visuelle sous le sachet (« touche ou glisse… »). */
    openPackHint: string;
    newCard: string;
    duplicate: string;
    card: {
      rarity: Record<TcgRarity, string>;
      foil: string;
      copies: string;
      /** Gabarit du crédit de logo ; absent ⇒ aucun crédit (cf. `TcgCard`). */
      logoCredit?: string;
      /** Badge de la catégorie « L'association » (cf. `TcgCard`). */
      association?: string;
    };
  };
};

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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Variables CSS d'une carte : son halo, et sa position de départ dans
 * l'éventail (elle part du centre du paquet, inclinée selon son rang).
 */
function cardVars(card: TcgRevealCard, i: number, n: number): CSSProperties {
  const fromCenter = i - (n - 1) / 2;
  return {
    '--tcg-halo': RARITY_HALO[card.rarity],
    '--fan-i': String(i),
    '--fan-x': `${(-fromCenter * 70).toFixed(0)}%`,
    '--fan-rot': `${(fromCenter * 9).toFixed(0)}deg`,
  } as CSSProperties;
}

export default function TcgPackReveal({
  cards,
  onDismiss,
  labels,
}: TcgPackRevealProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [state, dispatch] = useReducer(
    revealReducer,
    cards.map((c) => c.rarity),
    initialRevealState
  );
  const { phase, flipped } = state;

  useEffect(() => {
    // Focus d'abord (cf. l'en-tête), la séquence ensuite.
    headingRef.current?.focus();

    // MOUVEMENT RÉDUIT : on ne se contente pas de neutraliser l'animation CSS,
    // on saute la séquence. Sans ce test, le CSS poserait bien les cartes face
    // visible, mais l'état React les croirait encore cachées — « ouvrir » et
    // « tout révéler » resteraient affichés pour une grille déjà révélée.
    if (prefersReducedMotion()) {
      dispatch({ type: 'revealAll', celebrate: false });
    }
  }, []);

  // Une phase = une minuterie (ou un calendrier, pour les retournements).
  // Quitter la phase — « tout révéler » compris — les annule toutes.
  useEffect(() => {
    if (phase === 'tearing') {
      const t = window.setTimeout(() => dispatch({ type: 'torn' }), TEAR_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'burst') {
      const t = window.setTimeout(
        () => dispatch({ type: 'burstDone' }),
        BURST_MS
      );
      return () => window.clearTimeout(t);
    }
    if (phase === 'flipping') {
      const timers: number[] = [];
      for (const step of flipTimeline(state.rarities)) {
        if (step.tenseAt !== null) {
          const tenseAt = step.tenseAt;
          timers.push(
            window.setTimeout(
              () => dispatch({ type: 'tense', index: step.index }),
              tenseAt
            )
          );
        }
        timers.push(
          window.setTimeout(
            () => dispatch({ type: 'flip', index: step.index }),
            step.flipAt
          )
        );
      }
      return () => {
        for (const t of timers) window.clearTimeout(t);
      };
    }
    return undefined;
  }, [phase, state.rarities]);

  /** Une commande qui disparaît rend le focus au titre (cf. l'en-tête). */
  const keepFocus = () => {
    window.requestAnimationFrame(() => headingRef.current?.focus());
  };

  const open = () => {
    if (phase !== 'sealed') return;
    dispatch({ type: 'open' });
    keepFocus();
  };

  const revealAll = () => {
    dispatch({ type: 'revealAll', celebrate: !prefersReducedMotion() });
    keepFocus();
  };

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
              onClick={revealAll}
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

      <div className="tcg-pack-stage mt-5" data-phase={phase}>
        {(phase === 'sealed' || phase === 'tearing') && (
          <TcgPackSachet
            phase={phase}
            onOpen={open}
            labels={{
              openPack: labels.openPack,
              openPackHint: labels.openPackHint,
            }}
          />
        )}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {cards.map((card, i) => {
            const revealed = i < flipped;
            return (
              <li
                key={card.key}
                className="tcg-flip"
                style={cardVars(card, i, cards.length)}
              >
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

                <div
                  className="tcg-flip-inner"
                  data-revealed={String(revealed)}
                >
                  <div
                    className={`tcg-flip-face rounded-xl ${
                      // Le reflet n'appartient qu'aux brillantes : c'est ce qui
                      // les distingue, et le jouer partout le viderait de sens.
                      card.isFoil ? 'tcg-sheen relative' : ''
                    } tcg-halo`}
                    data-revealed={String(revealed)}
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
      </div>

      {hasDuplicate && labels.duplicateHint && (
        <p className="mt-4 text-xs text-gray-400">{labels.duplicateHint}</p>
      )}
    </section>
  );
}

/** Exporté pour les tests : l'ordre des raretés doit couvrir tous les halos. */
export const REVEAL_HALO_RARITIES = RARITY_ORDER;
