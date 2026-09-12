// utils/tcg/economy.ts
//
// Le barème de la monnaie du TCG. Module PUR (aucune I/O), comme
// `utils/tcg/rarity.ts`.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Aucune fonction ici ne connaît de
// moyen de paiement, et ce n'est pas un oubli : une monnaie achetable en argent
// réel + des paquets à contenu aléatoire forment une loot box payante —
// interdite en Belgique et aux Pays-Bas, surveillée par l'ANJ en France, avec
// un public qui compte des mineures. Y brancher un paiement serait une décision
// produit prise en connaissance de cause, pas une extension de ce fichier.
//
// LE RAPPORT SCRIM/MATCH EST DÉRIVÉ, PAS RECOPIÉ. Le dépôt pondère déjà un
// scrim à `SCRIM_RATING_WEIGHT` (0,5) pour le rating, avec cette justification :
// « un scrim informe moitié moins qu'un match officiel ». Le même rapport vaut
// pour la récompense, et l'IMPORTER plutôt que d'écrire « 50 » garantit que les
// deux barèmes ne divergeront pas si l'un bouge.

import { SCRIM_RATING_WEIGHT } from '@/utils/rating/computePlayerRatings';

/**
 * Pièces gagnées pour une victoire en match de tournoi.
 *
 * Valeur de référence de tout le barème : les autres montants s'expriment par
 * rapport à elle, pour qu'un réglage se fasse à un seul endroit.
 */
export const MATCH_WIN_COINS = 100;

/**
 * Victoire en scrim classé. Dérivée, jamais écrite en dur — cf. l'en-tête.
 *
 * `Math.round` parce que les pièces sont entières : un poids qui ne tomberait
 * pas juste ne doit pas produire un solde fractionnaire.
 */
export const SCRIM_WIN_COINS = Math.round(
  MATCH_WIN_COINS * SCRIM_RATING_WEIGHT
);

/**
 * Prix d'un booster acheté.
 *
 * Trois victoires de tournoi, ou six scrims. Le paquet OFFERT à chaque victoire
 * reste gratuit : la monnaie ouvre une seconde voie, plus lente et choisie, elle
 * ne remplace pas la première.
 */
export const BOOSTER_PRICE_COINS = 3 * MATCH_WIN_COINS;

/** Ce que rapporte une victoire, selon la nature de la rencontre. */
export function coinsForWin(isScrim: boolean): number {
  return isScrim ? SCRIM_WIN_COINS : MATCH_WIN_COINS;
}

/**
 * Le solde permet-il cette dépense ?
 *
 * Un solde ou un prix aberrant (non fini, négatif) rend `false` : mieux vaut
 * refuser un achat que créditer un booster sur une donnée douteuse — le
 * booster, une fois ouvert, ne se reprend pas.
 */
export function canAfford(balance: number, price: number): boolean {
  if (!Number.isFinite(balance) || !Number.isFinite(price)) return false;
  if (balance < 0 || price <= 0) return false;
  return balance >= price;
}
