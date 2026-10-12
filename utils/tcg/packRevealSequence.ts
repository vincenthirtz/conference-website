// utils/tcg/packRevealSequence.ts
//
// LA SÉQUENCE D'OUVERTURE D'UN PAQUET, SANS REACT NI MINUTERIE.
//
// Le composant (`components/tcg/TcgPackReveal.tsx`) ne fait que programmer des
// `setTimeout` et dessiner l'état ; ce qui se passe, dans quel ordre et à quel
// moment, vit ici — pour se tester sans DOM, sans horloge simulée, sans rendu.
//
//   sealed ──(ouvrir)──▶ tearing ──(déchiré)──▶ burst ──(posé)──▶ flipping ──▶ done
//      │                    │                     │                 │
//      └──────────────── « tout révéler » / mouvement réduit ───────┴──▶ done
//
// UNE SEULE SORTIE DE SECOURS, ET ELLE MÈNE AU BOUT. « Tout révéler » saute la
// séquence ENTIÈRE, déchirure comprise, depuis n'importe quelle phase. Le
// mouvement réduit passe par la même action, sans célébration : les cartes
// sont alors posées face visible d'emblée, comme avant l'arrivée du sachet.
//
// LES ACTIONS EN RETARD SONT INOFFENSIVES. Une minuterie qui tombe après un
// « tout révéler » (ou après un démontage raté) ne doit jamais faire REVENIR
// la séquence en arrière : chaque transition vérifie la phase dont elle part,
// et `flip` ne fait que monter.

import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';

export type RevealPhase = 'sealed' | 'tearing' | 'burst' | 'flipping' | 'done';

export type RevealState = {
  phase: RevealPhase;
  /** Raretés du paquet, dans l'ordre : la tension et la fête en dépendent. */
  rarities: readonly TcgRarity[];
  /** Nombre de cartes déjà retournées, dans l'ordre du paquet. */
  flipped: number;
  /** Carte qui « tremble » avant de se retourner, ou `null`. */
  tense: number | null;
  /**
   * Compteur de célébrations légendaires. Un compteur et non un booléen : le
   * composant s'en sert de `key` pour REJOUER la lueur à chaque légendaire.
   */
  celebrations: number;
};

export type RevealAction =
  | { type: 'open' }
  | { type: 'torn' }
  | { type: 'burstDone' }
  | { type: 'tense'; index: number }
  | { type: 'flip'; index: number }
  /** `celebrate: false` pour le mouvement réduit — aucune fête animée. */
  | { type: 'revealAll'; celebrate: boolean };

/**
 * Durée de la déchirure (CSS `tcg-sachet-tear-*`) : le haut du sachet part,
 * le corps s'efface. Assez long pour qu'on voie le geste, assez court pour ne
 * pas retenir les cartes.
 */
export const TEAR_MS = 620;

/**
 * Durée de l'éventail (CSS `tcg-burst`, délai d'échelonnement compris) : les
 * cartes jaillissent du sachet vers leur place avant de se retourner.
 */
export const BURST_MS = 760;

/**
 * Délai entre deux retournements.
 *
 * MESURÉ CONTRE LA DURÉE DU RETOURNEMENT (640 ms, cf. `globals.css`) : plus
 * court, les cartes se chevauchent et la séquence devient un brouillon ; plus
 * long, un paquet de cinq traîne. 260 ms laisse voir chaque carte partir avant
 * que la suivante bouge.
 */
export const STAGGER_MS = 260;

/**
 * Le suspense avant le retournement, par rareté : la carte tremble et
 * s'illumine d'autant plus longtemps qu'elle est rare. Une commune se retourne
 * sans prévenir — c'est l'absence de tension qui la dit commune.
 *
 * Plafonné à ~1 s : au-delà, la tension devient de l'attente.
 */
export const TENSION_MS: Record<TcgRarity, number> = {
  common: 0,
  rare: 420,
  epic: 700,
  legendary: 1050,
};

export type FlipStep = {
  index: number;
  /** Début du tremblement (ms depuis le début des retournements), ou `null`. */
  tenseAt: number | null;
  /** Moment du retournement (ms depuis le début des retournements). */
  flipAt: number;
};

/**
 * Le calendrier des retournements. La tension d'une carte s'INTERCALE avant
 * elle : une légendaire repousse d'autant les cartes qui la suivent, au lieu
 * de trembler par-dessus le retournement de sa voisine.
 */
export function flipTimeline(rarities: readonly TcgRarity[]): FlipStep[] {
  const steps: FlipStep[] = [];
  let cursor = 0;
  rarities.forEach((rarity, index) => {
    const tension = TENSION_MS[rarity] ?? 0;
    const flipAt = cursor + tension;
    steps.push({
      index,
      tenseAt: tension > 0 ? cursor : null,
      flipAt,
    });
    cursor = flipAt + STAGGER_MS;
  });
  return steps;
}

/** Les cartes qui tremblent avant de se retourner (rare et au-delà). */
export function hasTension(rarity: TcgRarity): boolean {
  return (TENSION_MS[rarity] ?? 0) > 0;
}

/** Les cartes qui reçoivent le reflet holographique une fois révélées. */
export function isHolographic(rarity: TcgRarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf('epic');
}

export function initialRevealState(
  rarities: readonly TcgRarity[]
): RevealState {
  return {
    // Un paquet vide n'a rien à ouvrir : il est déjà « révélé », et aucune
    // commande inerte (« ouvrir », « tout révéler ») ne reste au clavier.
    phase: rarities.length === 0 ? 'done' : 'sealed',
    rarities,
    flipped: 0,
    tense: null,
    celebrations: 0,
  };
}

export function revealReducer(
  state: RevealState,
  action: RevealAction
): RevealState {
  const total = state.rarities.length;
  switch (action.type) {
    case 'open':
      return state.phase === 'sealed' ? { ...state, phase: 'tearing' } : state;
    case 'torn':
      return state.phase === 'tearing' ? { ...state, phase: 'burst' } : state;
    case 'burstDone':
      return state.phase === 'burst' ? { ...state, phase: 'flipping' } : state;
    case 'tense':
      if (state.phase !== 'flipping' || action.index < state.flipped) {
        return state;
      }
      return { ...state, tense: action.index };
    case 'flip': {
      if (state.phase !== 'flipping' || action.index < state.flipped) {
        return state;
      }
      const flipped = Math.min(total, action.index + 1);
      const legendary = state.rarities
        .slice(state.flipped, flipped)
        .includes('legendary');
      return {
        ...state,
        flipped,
        tense:
          state.tense !== null && state.tense < flipped ? null : state.tense,
        phase: flipped >= total ? 'done' : 'flipping',
        celebrations: state.celebrations + (legendary ? 1 : 0),
      };
    }
    case 'revealAll': {
      if (state.phase === 'done' && state.flipped >= total) return state;
      const legendary = state.rarities
        .slice(state.flipped)
        .includes('legendary');
      return {
        ...state,
        phase: 'done',
        flipped: total,
        tense: null,
        celebrations:
          state.celebrations + (action.celebrate && legendary ? 1 : 0),
      };
    }
    default:
      return state;
  }
}
