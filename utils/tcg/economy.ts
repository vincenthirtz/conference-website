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
// pour la récompense — appliqué à l'unité du barème (`COIN_UNIT`), donc à la
// défaite de tournoi, la victoire ayant été relevée à part le 2026-10-12 — et
// l'IMPORTER plutôt que d'écrire « 50 » garantit que les deux barèmes ne
// divergeront pas si l'un bouge.

import { SCRIM_RATING_WEIGHT } from '@/utils/rating/computePlayerRatings';

/**
 * Valeur de référence du barème.
 *
 * Tous les montants du TCG s'expriment en multiples de cette unité, pour qu'un
 * réglage d'ensemble se fasse à un seul endroit. Elle a longtemps été confondue
 * avec la victoire de tournoi (`MATCH_WIN_COINS`) ; elle en est séparée depuis
 * le 2026-10-12, quand la victoire a été relevée SANS que le reste bouge.
 */
export const COIN_UNIT = 100;

/**
 * Pièces gagnées pour une victoire en match de tournoi.
 *
 * DEUX UNITÉS, DÉCISION PRODUIT DU 2026-10-12 : « une victoire rapporte
 * 200 pièces, la défaite reste à 100, le booster reste à 300 ». La victoire
 * passe ainsi nettement au-dessus de la défaite (le double, plus un paquet
 * offert), sans renchérir ni déprécier le reste du barème — qui, lui, reste
 * indexé sur `COIN_UNIT`. Non rétroactif : les victoires déjà payées gardent
 * leur montant d'alors (aucune réécriture du registre).
 */
export const MATCH_WIN_COINS = 2 * COIN_UNIT;

/**
 * Victoire en scrim classé. Dérivée, jamais écrite en dur — cf. l'en-tête.
 *
 * Indexée sur `COIN_UNIT` et non sur `MATCH_WIN_COINS` : le relèvement de la
 * victoire de tournoi (2026-10-12) ne concerne pas les scrims, qui restent à
 * une demi-unité.
 *
 * `Math.round` parce que les pièces sont entières : un poids qui ne tomberait
 * pas juste ne doit pas produire un solde fractionnaire.
 */
export const SCRIM_WIN_COINS = Math.round(COIN_UNIT * SCRIM_RATING_WEIGHT);

/**
 * Prix d'un booster acheté.
 *
 * Trois unités : trois défaites de tournoi, six scrims, ou une victoire et
 * demie depuis que la victoire vaut deux unités (2026-10-12). Le paquet OFFERT à chaque victoire
 * reste gratuit : la monnaie ouvre une seconde voie, plus lente et choisie, elle
 * ne remplace pas la première.
 */
export const BOOSTER_PRICE_COINS = 3 * COIN_UNIT;

/**
 * Pièces gagnées pour une DÉFAITE en match de tournoi (2026-10-12).
 *
 * Décision produit : « chaque défaite rapporte 100 pièces, trois défaites
 * donnent un booster ». D'où UNE unité, et pas un chiffre écrit en dur :
 * `BOOSTER_PRICE_COINS = 3 * COIN_UNIT`, donc trois défaites paient exactement
 * un booster, et un réglage du barème emporte les deux.
 *
 * LA VICTOIRE RESTE AU-DESSUS : depuis le 2026-10-12 elle rapporte le double
 * (`MATCH_WIN_COINS = 2 * COIN_UNIT`), PLUS un paquet offert. Une défaite ne
 * donne que des pièces.
 *
 * Pas de pendant en scrim ni en forfait : cf. `utils/tcg/grantDefeatRewards.ts`.
 */
export const MATCH_LOSS_COINS = COIN_UNIT;

/**
 * Ce que rapporte le recyclage d'un DOUBLON.
 *
 * Un dixième du booster : dix doublons pour en racheter un. Le rapport se
 * défend dans les deux sens — assez pour que les doublons cessent d'être des
 * objets morts, trop peu pour concurrencer la victoire, qui doit rester la
 * voie principale (cf. `BOOSTER_PRICE_COINS` : « la monnaie ouvre une seconde
 * voie, plus lente et choisie, elle ne remplace pas la première »).
 *
 * DÉRIVÉ, JAMAIS ÉCRIT EN DUR. Comme `SCRIM_WIN_COINS`, cette valeur suit son
 * référent : régler le prix du booster règle mécaniquement la reprise, et les
 * deux ne peuvent pas diverger.
 *
 * `Math.round` parce que les pièces sont entières, et un plancher à 1 pour
 * qu'un réglage agressif du prix ne rende jamais le recyclage gratuit — une
 * action qui ne rapporte rien est pire qu'une action absente.
 */
export const RECYCLE_REFUND_COINS = Math.max(
  1,
  Math.round(BOOSTER_PRICE_COINS / 10)
);

/**
 * Nombre de DOUBLONS d'une même rareté que la forge consomme.
 *
 * Trois, et pas cinq : il faut que le geste soit atteignable. Au 2026-09-27,
 * 235 cartes avaient été tirées pour 63 comptes — exiger cinq doublons d'une
 * même rareté aurait rendu la forge théorique pour presque tout le monde, et
 * un débit qu'on ne peut pas déclencher ne dépense rien.
 */
export const FORGE_DUPLICATES_REQUIRED = 3;

/**
 * Pièces prélevées par une forge, EN PLUS des doublons.
 *
 * La moitié d'un booster. Le calcul se défend dans les deux sens :
 *   - ce qu'on abandonne (3 doublons recyclables = 90 pièces, plus 150 payées)
 *     vaut 240 pièces, contre 300 pour un booster de cinq cartes ;
 *   - mais la forge rend UNE carte CHOISIE dans un palier supérieur, et que
 *     l'on ne possède pas. On paie moins cher, pour moins de cartes, avec une
 *     certitude que le booster n'offre pas.
 *
 * Défavorable au volume, favorable à la collection : c'est exactement ce qui
 * manquait. Les séries stagnent (la meilleure collection réunit 3 équipes sur
 * 10) et les doublons s'entassent, le recyclage n'ayant servi qu'une fois.
 *
 * DÉRIVÉ, comme ses voisins : régler le prix du booster règle la forge, et les
 * deux ne peuvent pas diverger.
 */
export const FORGE_FEE_COINS = Math.max(1, Math.round(BOOSTER_PRICE_COINS / 2));

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
