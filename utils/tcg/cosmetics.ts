// utils/tcg/cosmetics.ts
//
// LES COSMÉTIQUES DE VITRINE — cadres et fonds, achetés avec des pièces
// gagnées, posés sur la vitrine publique de trois cartes.
//
// POURQUOI. Au 2026-09-27 : 10 805 pièces gagnées, **zéro dépensée**, et
// **deux** vitrines configurées sur 63 comptes. Le seul débit était le booster,
// qui offre « plus de la même chose ». Un cosmétique, lui, ne donne aucun
// avantage et ne dérègle rien : il récompense un effort par de la visibilité,
// ce qui est exactement ce que la vitrine fait déjà gratuitement pour deux
// personnes.
//
// ACHETÉ ≠ POSÉ, et la distinction n'est pas décorative. `unlocked_cosmetics`
// garde ce qu'on a payé, `frame` / `background` disent ce qu'on affiche.
// Changer d'habillage ne repaie donc rien, et changer d'avis ne perd rien —
// sans quoi chaque essai coûterait, ce qui dissuade exactement le geste qu'on
// cherche à encourager.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Aucun de ces prix n'est payable
// en euros, ni directement ni par un intermédiaire (cf. docs/TCG.md §4).
//
// CATALOGUE EN DUR, ET NON EN BASE. Un cosmétique est un rendu — des classes
// CSS et un nom — pas une donnée d'exploitation. Le mettre en base obligerait à
// synchroniser un style et une ligne, pour un catalogue que personne n'édite en
// production.

import { BOOSTER_PRICE_COINS } from './economy';

export type CosmeticKind = 'frame' | 'background';

export type Cosmetic = {
  key: string;
  kind: CosmeticKind;
  /** Libellé affiché. Court : il tient sous une vignette. */
  label: string;
  priceCoins: number;
};

/**
 * Prix d'un cosmétique, DÉRIVÉ du barème comme ses voisins.
 *
 * Deux tiers d'un booster. Assez pour que l'achat se pense — c'est le but, on
 * cherche un débit — mais en dessous du paquet : un habillage ne doit pas
 * coûter plus cher que des cartes, sinon personne ne le prend et le débit
 * n'existe que sur le papier.
 */
const TIER_ONE = Math.max(1, Math.round((BOOSTER_PRICE_COINS * 2) / 3));

/**
 * Le palier « rare » : deux boosters. Réservé aux habillages qui se remarquent,
 * pour que le catalogue ait une pente — un catalogue plat ne se parcourt pas.
 */
const TIER_TWO = Math.max(TIER_ONE + 1, BOOSTER_PRICE_COINS * 2);

/**
 * Le catalogue. L'ordre est celui de l'affichage : les cadres d'abord (ils
 * changent la carte), les fonds ensuite (ils changent la scène).
 */
export const COSMETICS: readonly Cosmetic[] = [
  { key: 'frame_ribbon', kind: 'frame', label: 'Ruban', priceCoins: TIER_ONE },
  { key: 'frame_slate', kind: 'frame', label: 'Ardoise', priceCoins: TIER_ONE },
  { key: 'frame_gold', kind: 'frame', label: 'Or', priceCoins: TIER_TWO },
  {
    key: 'background_dusk',
    kind: 'background',
    label: 'Crépuscule',
    priceCoins: TIER_ONE,
  },
  {
    key: 'background_arena',
    kind: 'background',
    label: 'Arène',
    priceCoins: TIER_ONE,
  },
  {
    key: 'background_aurora',
    kind: 'background',
    label: 'Aurore',
    priceCoins: TIER_TWO,
  },
] as const;

const BY_KEY = new Map(COSMETICS.map((c) => [c.key, c] as const));

/** Le cosmétique de cette clé, ou `null` si le catalogue ne la connaît pas. */
export function findCosmetic(key: unknown): Cosmetic | null {
  return typeof key === 'string' ? (BY_KEY.get(key) ?? null) : null;
}

export type CosmeticRefusal =
  /** Clé absente du catalogue. */
  | 'unknown_cosmetic'
  /** Déjà acheté : on ne le fait pas payer deux fois. */
  | 'already_owned'
  /** Solde insuffisant. */
  | 'insufficient_funds';

export type CosmeticPurchase =
  | { ok: true; cosmetic: Cosmetic }
  | { ok: false; reason: CosmeticRefusal };

/**
 * Peut-on acheter ce cosmétique ?
 *
 * PURE : la règle se relit et se teste sans base. `already_owned` est un refus
 * et non un achat silencieux — prélever deux fois pour le même objet est la
 * façon la plus sûre de perdre la confiance dans une monnaie.
 */
export function planCosmeticPurchase(input: {
  key: unknown;
  owned: readonly string[];
  balance: number;
}): CosmeticPurchase {
  const cosmetic = findCosmetic(input.key);
  if (!cosmetic) return { ok: false, reason: 'unknown_cosmetic' };
  if (input.owned.includes(cosmetic.key)) {
    return { ok: false, reason: 'already_owned' };
  }
  if (input.balance < cosmetic.priceCoins) {
    return { ok: false, reason: 'insufficient_funds' };
  }
  return { ok: true, cosmetic };
}

/**
 * Peut-on POSER ce cosmétique ?
 *
 * `null` est toujours valide : c'est le retour au rendu par défaut, et il ne
 * doit dépendre de rien — un retrait qui échoue laisse en place exactement ce
 * qu'on demande d'enlever (même principe que la désactivation de la vitrine).
 */
export function canEquip(input: {
  key: string | null;
  kind: CosmeticKind;
  owned: readonly string[];
}): boolean {
  if (input.key === null) return true;
  const cosmetic = findCosmetic(input.key);
  if (!cosmetic || cosmetic.kind !== input.kind) return false;
  return input.owned.includes(cosmetic.key);
}
