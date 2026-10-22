// utils/tcg/cardStats.ts
//
// ATTAQUE, DÉFENSE ET NIVEAU d'une carte, à la Yu-Gi-Oh — le prélude à
// l'arène de la Women's Library (docs/PLAN-tcg-2.md, lots 11 et 12).
//
// UNE CARTE EST SOUVENT UNE PERSONNE. Des points tirés de ses performances
// (rating, K/D, taux de victoire, votes MVP) ou d'un hasard propre à chaque
// joueuse classeraient deux joueuses réelles du même palier l'une au-dessus de
// l'autre, en public : c'est la « seconde échelle » que `rarity.ts` refuse
// depuis l'origine, et une carte « 900 ATK » qui circule sous un nom peut
// rabaisser quelqu'un. Les chiffres ne viennent donc QUE de ce que la carte
// est déjà :
//   - sa RARETÉ, figée au tirage (`tcg_pack_cards.rarity`), décide de la
//     PUISSANCE (ATK + DEF) et du NIVEAU — l'échelle existante, rien d'autre ;
//   - son TYPE, ou le RÔLE de jeu d'une joueuse ou d'un héros (un fait public,
//     déjà dessiné par la figurine), ne décide que de la RÉPARTITION.
// Aucun type ne vaut plus qu'un autre à rareté égale ; même type + même rôle +
// même rareté ⇒ mêmes chiffres, au point près. Et la brillante ne donne RIEN :
// le foil est une variante d'impression, pas un palier (`FOIL_CHANCE`).
//
// LE RÔLE EST FIGÉ AU TIRAGE, LES CHIFFRES SONT DÉRIVÉS. Le rôle bouge — une
// joueuse change de héros favori ou de spécialité, et le jeu reclasse ses
// héros (Sombra, Dégâts → Soutien, le 2026-10-17). Comme la rareté, il est donc
// figé sur l'exemplaire (`tcg_pack_cards.card_role`, migration
// `tcg_card_role.sql`). Les chiffres, eux, restent cette fonction pure de trois
// entrées figées ou immuables : les stocker en plus doublerait cette table en
// SQL sans rien stabiliser de plus.
//
// LE RETRAIT VAUT AUSSI POUR LES CHIFFRES. Une joueuse retirée du TCG (§2.4 bis
// de docs/TCG.md) a une face anonyme ; un rôle lu sur sa carte la rendrait
// recoupable (« la légendaire tank anonyme »). `statRoleOf` ne lit donc aucun
// rôle d'une joueuse retirée : sa carte prend le profil Équilibre de sa
// rareté, comme toute carte sans rôle.
//
// PUR, ET SANS IMPORT À L'EXÉCUTION : le site l'importe dans des pages
// publiques (la carte d'une fiche joueuse ou d'équipe), où chaque octet compte.

import type { FigureRole } from './roleFigures';
import type { TcgRarity } from './rarity';
import type { TcgCardKind } from './subjectKey';

/**
 * Les trois RÉPARTITIONS de la puissance d'une carte.
 *
 * `assault` (Assaut) : l'attaque d'abord ; `bulwark` (Rempart) : la défense
 * d'abord ; `balanced` (Équilibre) : moitié-moitié. Trois profils et pas un
 * par type : un profil est une forme de jeu à choisir en duel, pas une
 * étiquette par sujet.
 */
export const CARD_STAT_PROFILES = ['assault', 'bulwark', 'balanced'] as const;
export type CardStatProfile = (typeof CARD_STAT_PROFILES)[number];

/** Ce qu'une carte affiche, et ce que l'arène lira. */
export type CardStats = {
  /** Étoiles, à la Yu-Gi-Oh (3, 4, 6 ou 8). */
  level: number;
  attack: number;
  defense: number;
  profile: CardStatProfile;
};

/**
 * Le NIVEAU par rareté.
 *
 * Il tombe dans les trois classes d'invocation de Yu-Gi-Oh : 3–4 sans
 * sacrifice, 6 avec un, 8 avec deux — l'arène pourra s'en servir telle quelle.
 * `common` est au niveau 3 et non 1 : un plancher, pas un échec (cf.
 * `cardRarity`).
 */
export const CARD_LEVEL_BY_RARITY = {
  common: 3,
  rare: 4,
  epic: 6,
  legendary: 8,
} as const satisfies Record<TcgRarity, number>;

/**
 * LE BARÈME, écrit en clair plutôt que calculé : c'est un tableau qu'on lit
 * dans la documentation, pas une formule à retrouver. Chaque rangée a la même
 * somme dans les trois profils (2 400, 3 000, 4 000, 5 000) — c'est
 * l'invariant « aucun profil ne vaut plus qu'un autre », vérifié par le test.
 * Les magnitudes sont celles de Yu-Gi-Oh : 1 800 ATK au niveau 4, 3 000 au
 * niveau 8.
 */
export const CARD_STATS_TABLE = {
  common: {
    assault: { attack: 1400, defense: 1000 },
    bulwark: { attack: 1000, defense: 1400 },
    balanced: { attack: 1200, defense: 1200 },
  },
  rare: {
    assault: { attack: 1800, defense: 1200 },
    bulwark: { attack: 1200, defense: 1800 },
    balanced: { attack: 1500, defense: 1500 },
  },
  epic: {
    assault: { attack: 2400, defense: 1600 },
    bulwark: { attack: 1600, defense: 2400 },
    balanced: { attack: 2000, defense: 2000 },
  },
  legendary: {
    assault: { attack: 3000, defense: 2000 },
    bulwark: { attack: 2000, defense: 3000 },
    balanced: { attack: 2500, defense: 2500 },
  },
} as const satisfies Record<
  TcgRarity,
  Record<CardStatProfile, { attack: number; defense: number }>
>;

/** Rôle de jeu → répartition. Un rôle inconnu n'a pas d'entrée : Équilibre. */
const PROFILE_BY_ROLE = {
  tank: 'bulwark',
  damage: 'assault',
  support: 'balanced',
} as const satisfies Record<FigureRole, CardStatProfile>;

/**
 * La répartition des types SANS rôle de jeu. Exhaustif par le type : un
 * septième type de carte ne compile pas tant qu'on n'a pas dit son profil
 * (le travers des mascottes, invisibles faute d'une branche, cf.
 * `subjectKey.ts`). `player` et `hero` y figurent pour l'exhaustivité : leur
 * valeur est celle d'un rôle inconnu.
 */
const PROFILE_BY_KIND = {
  // Rôle inconnu (aucun héros choisi, `flex`, ou retirée) : on n'attribue pas
  // un rôle au hasard.
  player: 'balanced',
  hero: 'balanced',
  // Une équipe, c'est les trois rôles ensemble.
  team: 'balanced',
  // Un terrain ne frappe pas, il se tient.
  map: 'bulwark',
  // Un compagnon, ni devant ni derrière.
  mascot: 'balanced',
  // Une image est un coup d'éclat. L'ASSOCIATION AUSSI : c'est une catégorie
  // de fan art, pas un type de carte (`subject_kind = 'fanart'`, docs/TCG.md
  // « La catégorie L'association ») — tirage, échanges, forge la traitent sans
  // une ligne de plus, les chiffres aussi. Et c'est ce qui les garde stables :
  // une œuvre RETIRÉE n'a plus de face lisible (catégorie comprise), elle ne
  // doit pas changer de chiffres pour autant.
  fanart: 'assault',
} as const satisfies Record<TcgCardKind, CardStatProfile>;

/** Les types dont la répartition suit un rôle de jeu. */
export function hasStatRole(kind: string): boolean {
  return kind === 'player' || kind === 'hero';
}

const isFigureRole = (v: unknown): v is FigureRole =>
  v === 'tank' || v === 'damage' || v === 'support';

/**
 * Le rôle lu sur une ligne de `tcg_pack_cards.card_role`.
 *
 *   - `undefined` : la colonne n'a PAS été lue (migration pas encore
 *     appliquée, cf. `cardRoleReady.ts`) — l'appelant retombe sur le rôle
 *     courant ;
 *   - `null` : rôle figé INCONNU (NULL en base) ;
 *   - une valeur hors des trois rôles : traitée comme inconnue, jamais
 *     devinée — le CHECK de la migration rend ce cas impossible.
 */
export function parseCardRole(raw: unknown): FigureRole | null | undefined {
  if (raw === undefined) return undefined;
  return isFigureRole(raw) ? raw : null;
}

/** Rôle du registre des héros (`Tank` / `Damage` / `Support`) → rôle de carte. */
export function statRoleFromHeroRole(
  role: string | null | undefined
): FigureRole | null {
  switch ((role ?? '').trim().toLowerCase()) {
    case 'tank':
      return 'tank';
    case 'damage':
    case 'dps':
      return 'damage';
    case 'support':
      return 'support';
    default:
      return null;
  }
}

/**
 * LE rôle qui répartit les chiffres d'un exemplaire.
 *
 * Dans cet ordre, et l'ordre est la règle :
 *   1. une joueuse RETIRÉE n'a pas de rôle (anonyme aussi par ses chiffres) ;
 *   2. le rôle FIGÉ au tirage, s'il a été lu — même `null` : un rôle inconnu
 *      au tirage le reste, il ne se « rattrape » pas sur le rôle d'aujourd'hui ;
 *   3. à défaut (colonne pas encore lue), le rôle COURANT, celui que dessine
 *      la figurine — juste, mais pas encore stable.
 * Un type sans rôle de jeu rend toujours `null`.
 */
export function statRoleOf(input: {
  kind: string;
  frozen?: FigureRole | null;
  current?: FigureRole | null;
  withdrawn?: boolean;
}): FigureRole | null {
  if (!hasStatRole(input.kind)) return null;
  if (input.kind === 'player' && input.withdrawn) return null;
  if (input.frozen !== undefined) return input.frozen;
  return input.current ?? null;
}

/** La répartition d'une carte. */
export function cardStatProfile(input: {
  kind: string;
  role?: FigureRole | null;
}): CardStatProfile {
  if (hasStatRole(input.kind) && isFigureRole(input.role)) {
    return PROFILE_BY_ROLE[input.role];
  }
  // Un type inconnu (carte écrite par une version plus récente) prend
  // Équilibre : une carte sans chiffres serait une carte cassée, et des
  // chiffres extrêmes affirmeraient ce que le code ne sait pas. `hasOwn` et
  // non `in` : « constructor » n'est pas un type de carte.
  return hasOwn(PROFILE_BY_KIND, input.kind)
    ? (PROFILE_BY_KIND as Record<string, CardStatProfile>)[input.kind]
    : 'balanced';
}

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Les chiffres d'un EXEMPLAIRE lu en base, en un appel : rôle figé
 * (`tcg_pack_cards.card_role` brut, `undefined` s'il n'a pas été lu), rôle
 * courant (figurine d'une joueuse, registre d'un héros), retrait — résolus par
 * `statRoleOf`, puis le barème. C'est la seule porte des lecteurs : aucun n'a
 * à se rappeler l'ordre « retrait, figé, courant ».
 */
export function copyStats(input: {
  kind: string;
  rarity: TcgRarity;
  frozenRole?: unknown;
  currentRole?: FigureRole | null;
  withdrawn?: boolean;
}): CardStats {
  return cardStats({
    kind: input.kind,
    rarity: input.rarity,
    role: statRoleOf({
      kind: input.kind,
      frozen: parseCardRole(input.frozenRole),
      current: input.currentRole,
      withdrawn: input.withdrawn,
    }),
  });
}

/**
 * Niveau, attaque et défense d'une carte.
 *
 * `rarity` est la rareté de L'EXEMPLAIRE (figée au tirage) ; `role`, celui que
 * rend `statRoleOf`. Pas de paramètre de brillance : elle ne donne rien. Une
 * rareté inconnue retombe sur `common`, comme partout ailleurs dans le TCG.
 */
export function cardStats(input: {
  kind: string;
  rarity: TcgRarity;
  role?: FigureRole | null;
}): CardStats {
  const rarity: TcgRarity = hasOwn(CARD_STATS_TABLE, input.rarity)
    ? input.rarity
    : 'common';
  const profile = cardStatProfile(input);
  const { attack, defense } = CARD_STATS_TABLE[rarity][profile];
  return { level: CARD_LEVEL_BY_RARITY[rarity], attack, defense, profile };
}
