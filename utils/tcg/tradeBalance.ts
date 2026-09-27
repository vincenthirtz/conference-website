// utils/tcg/tradeBalance.ts
//
// L'ÉCART DE RARETÉ d'une proposition d'échange, résumé en un coup d'œil.
//
// POURQUOI. La parité d'un échange porte sur le NOMBRE de cartes, jamais sur
// leur valeur : une commune contre une légendaire passe si la destinataire
// accepte. C'est une décision assumée (docs/TCG.md) — arbitrer la valeur à sa
// place, c'est décider pour elle.
//
// Mais « elle accepte » n'a de sens que si elle VOIT. Chaque carte affiche déjà
// sa rareté ; avec cinq cartes de chaque côté, comparer devient un travail, et
// un travail qu'on ne fait pas. Ce module fait la somme, et rend un verdict en
// un mot. Il n'interdit rien : il informe, ce qui est exactement la différence
// entre un consentement et un clic.
//
// LE BARÈME EST ORDINAL, PAS MONÉTAIRE. On additionne des rangs de rareté
// (commune 0 … légendaire 3), pas des « valeurs » — inventer une monnaie de la
// rareté créerait un prix, donc une spéculation, et c'est précisément ce que le
// plan refuse. Une brillante compte un demi-rang : elle se remarque sans valoir
// un palier.
//
// PUR : aucune I/O, et c'est ce qui permet de le tester sans base et de
// l'afficher des deux côtés (proposante et destinataire).

import { RARITY_ORDER, type TcgRarity } from './rarity';

/** Une carte, réduite à ce qui pèse dans la comparaison. */
export type BalanceCard = { rarity: TcgRarity | null; isFoil?: boolean | null };

export type SideSummary = {
  count: number;
  /** Combien de cartes par rareté — l'affichage détaillé. */
  byRarity: Record<TcgRarity, number>;
  /** La meilleure rareté du lot, pour la phrase courte. `null` si vide. */
  best: TcgRarity | null;
  foils: number;
  /** Somme des rangs, brillantes comprises. Sert au verdict, pas à l'affichage. */
  score: number;
};

export type TradeVerdict =
  /** Les deux côtés pèsent pareil, à un demi-rang près. */
  | 'even'
  /** La destinataire reçoit mieux qu'elle ne donne. */
  | 'favours_recipient'
  /** La destinataire donne mieux qu'elle ne reçoit. */
  | 'favours_proposer';

export type TradeBalance = {
  /** Ce que la proposante donne. */
  offered: SideSummary;
  /** Ce que la proposante demande. */
  requested: SideSummary;
  verdict: TradeVerdict;
};

/**
 * Le seuil de l'égalité, en rangs.
 *
 * Un demi-rang : un écart de brillante seul ne fait pas pencher la balance, un
 * écart de palier oui. Mettre 0 rendrait presque tout « déséquilibré », ce qui
 * reviendrait à ne plus rien signaler.
 */
const EVEN_TOLERANCE = 0.5;

/** Une brillante pèse un demi-rang : elle se remarque sans valoir un palier. */
const FOIL_WEIGHT = 0.5;

function emptyByRarity(): Record<TcgRarity, number> {
  return { common: 0, rare: 0, epic: 0, legendary: 0 };
}

function rank(rarity: TcgRarity): number {
  const i = RARITY_ORDER.indexOf(rarity);
  return i < 0 ? 0 : i;
}

/** Résume un côté. Une rareté inconnue compte comme `common`, jamais ignorée. */
export function summarizeSide(cards: readonly BalanceCard[]): SideSummary {
  const byRarity = emptyByRarity();
  let score = 0;
  let foils = 0;
  let best: TcgRarity | null = null;

  for (const card of cards) {
    // `null` arrive d'une ligne ancienne ou d'une lecture partielle. La compter
    // `common` plutôt que la sauter : une carte absente du total ferait mentir
    // le verdict sans que rien ne le dise.
    const rarity: TcgRarity = card.rarity ?? 'common';
    byRarity[rarity] += 1;
    score += rank(rarity);
    if (card.isFoil) {
      foils += 1;
      score += FOIL_WEIGHT;
    }
    if (best === null || rank(rarity) > rank(best)) best = rarity;
  }

  return { count: cards.length, byRarity, best, foils, score };
}

/**
 * Le bilan d'une proposition, du point de vue de la DESTINATAIRE.
 *
 * `offered` est ce qu'elle reçoit, `requested` ce qu'elle donne — c'est son
 * écran qui a besoin du verdict, et le formuler dans l'autre sens obligerait
 * chaque appelant à retourner la phrase.
 */
export function tradeBalance(input: {
  offered: readonly BalanceCard[];
  requested: readonly BalanceCard[];
}): TradeBalance {
  const offered = summarizeSide(input.offered);
  const requested = summarizeSide(input.requested);
  const delta = offered.score - requested.score;

  return {
    offered,
    requested,
    verdict:
      Math.abs(delta) <= EVEN_TOLERANCE
        ? 'even'
        : delta > 0
          ? 'favours_recipient'
          : 'favours_proposer',
  };
}
