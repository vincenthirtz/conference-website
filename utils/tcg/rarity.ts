// utils/tcg/rarity.ts
//
// Rareté d'une carte de joueuse. Réducteur PUR (aucune I/O), comme
// `utils/profile/achievements.ts` dont il prolonge le vocabulaire.
//
// POURQUOI DÉRIVER DES BADGES EXISTANTS plutôt que d'inventer une échelle. Le
// site affiche DÉJÀ un prestige, calculé par `computeAchievements` : champion,
// finaliste, podium, top_cut, vainqueure de ligue, paliers de peak rating,
// vétérane, série de victoires — chacun avec un palier
// bronze/silver/gold/platinum. Une seconde échelle, calibrée séparément,
// finirait par contredire la première : une joueuse « légendaire » au TCG et
// sans badge sur sa fiche, ou l'inverse. On réutilise donc la calibration déjà
// arbitrée.
//
// UN TITRE L'EMPORTE SUR UN CHIFFRE. `champion` et `league_winner` sont classés
// `gold` par le calcul des badges, mais ils passent ici en `legendary` — au même
// rang que le palier `platinum` du peak rating. Gagner un tournoi ou une saison
// est un fait unique et daté ; un rating élevé est un état, qui peut redescendre.
// Les traiter à égalité ferait valoir moins une victoire qu'un bon classement.
//
// PAS DE CAS PARTICULIER POUR `unrated`. Une joueuse sans ligne `player_ratings`
// n'a mécaniquement aucun badge de rating (son `peakRating` vaut 0, donc aucun
// `peak_*` n'est dérivé) — elle sort donc `common` d'elle-même. En revanche, si
// elle figure au palmarès d'un tournoi, ce titre compte : il est réel, même sans
// classement.

import type { ProfileBadge, ProfileBadgeTier } from '@/types/rating';
import {
  PEAK_RATING_TIERS,
  type PeakRatingTierKey,
} from '@/utils/profile/achievements';

export type TcgRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Du plus courant au plus rare — ordre d'affichage et de tri. */
export const RARITY_ORDER: readonly TcgRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
] as const;

/**
 * Badges qui valent un titre, indépendamment de leur palier.
 *
 * `champion` = vainqueure d'un tournoi (placement rang 1).
 * `league_winner` = première d'une saison de ligue.
 */
const TITLE_KEYS: ReadonlySet<string> = new Set(['champion', 'league_winner']);

/** Palier de badge → rareté, quand aucun titre ne tranche. */
const RARITY_BY_TIER: Record<ProfileBadgeTier, TcgRarity> = {
  platinum: 'legendary',
  gold: 'epic',
  silver: 'rare',
  bronze: 'common',
};

/**
 * La rareté de la carte d'une joueuse, d'après ses badges.
 *
 * On garde la MEILLEURE rareté trouvée : une joueuse cumule les badges, et
 * c'est son plus haut fait qui décide de sa carte.
 *
 * Une liste vide — joueuse sans badge, ou tableau non fourni — rend `common`.
 * C'est un plancher, pas un échec : toute joueuse a une carte.
 */
export function cardRarity(badges: readonly ProfileBadge[]): TcgRarity {
  let best: TcgRarity = 'common';

  for (const badge of badges) {
    const value: TcgRarity = TITLE_KEYS.has(badge.key)
      ? 'legendary'
      : badge.tier
        ? RARITY_BY_TIER[badge.tier]
        : 'common';

    if (RARITY_ORDER.indexOf(value) > RARITY_ORDER.indexOf(best)) {
      best = value;
      // `legendary` est le maximum : inutile de parcourir la suite.
      if (best === 'legendary') break;
    }
  }

  return best;
}

/**
 * Probabilité qu'une carte tirée soit brillante.
 *
 * Indépendante de la rareté : le foil est une variante d'impression, pas un
 * degré de prestige supplémentaire. Sans cette séparation, une légendaire
 * brillante deviendrait un cinquième palier de fait, et le barème ci-dessus
 * cesserait de dire la vérité sur le parcours de la joueuse.
 */
export const FOIL_CHANCE = 0.08;

/**
 * `roll` est un tirage dans [0, 1) — fourni par l'appelant, ce qui garde cette
 * fonction pure et donc testable sans piloter `Math.random`.
 *
 * Un `roll` hors bornes ou non fini rend `false` : mieux vaut une carte mate
 * qu'un brillant distribué par accident sur une entrée aberrante.
 */
export function isFoil(roll: number): boolean {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return false;
  return roll < FOIL_CHANCE;
}

/* ---------------------------------------------------------------------------
 * Cartes de MAP
 * ------------------------------------------------------------------------- */

/**
 * La rareté d'une carte de map — la même pour toutes, toujours.
 *
 * UNE MAP N'A PAS DE PALMARÈS, DONC PAS DE PRESTIGE. Tout le barème ci-dessus
 * mesure un parcours : des badges gagnés, un rang obtenu, un rating atteint.
 * Une map ne gagne rien et ne progresse pas. Lui attribuer une rareté variable
 * demanderait d'inventer un second critère de valeur — l'ancienneté, la
 * fréquence en tournoi, le goût de qui écrit la liste — c'est-à-dire une
 * seconde échelle de prestige à côté de celle des joueuses. C'est exactement ce
 * que ce module refuse depuis l'origine : deux échelles finissent par dire deux
 * vérités différentes sur le même tournoi.
 *
 * Les cartes de map se distinguent donc par la BRILLANCE seule (`FOIL_CHANCE`),
 * qui est une variante d'impression et non un degré de mérite. Une map
 * brillante est rare sans prétendre valoir davantage.
 */
export const MAP_CARD_RARITY: TcgRarity = 'common';

/**
 * La rareté d'une carte de MASCOTTE — la même pour toutes, toujours.
 *
 * Même raisonnement que les maps, et il s'applique encore plus directement :
 * une mascotte ne gagne rien, ne progresse pas, et n'a pas de palmarès. La
 * hiérarchiser demanderait d'inventer un second critère de valeur — la
 * popularité, l'ancienneté, le goût de qui écrit la liste — c'est-à-dire une
 * seconde échelle de prestige à côté de celle des joueuses.
 *
 * `rare` et non `common` : une mascotte ne sort qu'une fois sur quatre sur le
 * seul emplacement de décor (`MASCOT_DECOR_SHARE`), là où une map sort trois
 * fois plus souvent. La rareté d'une carte dit ce qu'on a de la peine à
 * obtenir ; ici la fréquence de tirage le justifie sans rien mesurer du
 * prestige de personne.
 */
export const MASCOT_CARD_RARITY: TcgRarity = 'rare';

/* ---------------------------------------------------------------------------
 * Cartes d'ÉQUIPE
 * ------------------------------------------------------------------------- */

/**
 * Seuils de rating → rareté.
 *
 * CE SONT LES MÊMES CHIFFRES que les paliers `peak_*` des badges joueuses
 * (>= 2000 master/platinum, >= 1800 elite/gold, >= 1600 contender/silver), mais
 * APPLIQUÉS AUTREMENT : une joueuse les reçoit indirectement, via le badge que
 * `computeAchievements` en dérive ; une équipe n'ayant pas de badges, on les lui
 * applique directement sur `team_ratings.rating`.
 *
 * ILS NE SONT PLUS RECOPIÉS. Ce tableau portait les trois nombres en clair,
 * sous un commentaire qui disait « si l'un bouge, l'autre doit bouger » — et
 * rien ne le garantissait. Ils sont maintenant DÉRIVÉS de `PEAK_RATING_TIERS`,
 * et seule la correspondance palier → rareté reste ici, parce qu'elle seule
 * appartient au TCG.
 *
 * Le `Record` est exhaustif sur `PeakRatingTierKey` : ajouter un palier de
 * badge fait échouer la compilation ICI, au lieu de laisser une équipe sans
 * rareté correspondante.
 */
const PEAK_TIER_RARITY: Record<PeakRatingTierKey, TcgRarity> = {
  peak_master: 'legendary',
  peak_elite: 'epic',
  peak_contender: 'rare',
};

export const RATING_TIERS: ReadonlyArray<{ min: number; rarity: TcgRarity }> =
  PEAK_RATING_TIERS.map((t) => ({
    min: t.min,
    rarity: PEAK_TIER_RARITY[t.key],
  }));

/**
 * La rareté de la carte d'une équipe.
 *
 * Deux dimensions, dont on garde la meilleure :
 *   - le PALMARÈS (`bestRank`, le meilleur rang obtenu en tournoi). Rang 1 →
 *     `legendary`, comme le titre `champion` côté joueuse ; rang 2 → `rare`,
 *     comme le badge `finalist` (silver). Au-delà, le palmarès ne suffit pas :
 *     `podium` et `top_cut` sont `bronze` chez les joueuses, donc `common`.
 *   - le RATING courant, via `RATING_TIERS`.
 *
 * Aligner l'échelle sur celle des joueuses est délibéré : une équipe 3e et une
 * joueuse 3e doivent valoir la même chose, sans quoi le TCG dirait deux vérités
 * différentes sur le même tournoi.
 *
 * `bestRank` NULL (jamais classée) ou `rating` NULL (pas encore de roster noté)
 * sont des états normaux, pas des erreurs : la dimension est simplement ignorée.
 */
export function teamCardRarity(input: {
  bestRank: number | null;
  rating: number | null;
}): TcgRarity {
  let best: TcgRarity = 'common';

  const raise = (value: TcgRarity) => {
    if (RARITY_ORDER.indexOf(value) > RARITY_ORDER.indexOf(best)) best = value;
  };

  // Palmarès. Un rang <= 0 est une donnée aberrante : on l'ignore plutôt que de
  // la traiter comme une victoire.
  const rank = input.bestRank;
  if (typeof rank === 'number' && Number.isFinite(rank) && rank >= 1) {
    if (rank === 1) raise('legendary');
    else if (rank === 2) raise('rare');
  }

  // Rating.
  const rating = input.rating;
  if (typeof rating === 'number' && Number.isFinite(rating)) {
    for (const tier of RATING_TIERS) {
      if (rating >= tier.min) {
        raise(tier.rarity);
        break;
      }
    }
  }

  return best;
}
