// utils/tcg/fanart.ts
//
// Les cartes FAN ART : ce que la communauté dessine, ce que le staff valide, et
// ce qui entre dans les paquets. Module PUR (aucune I/O), comme `drawPack.ts`
// dont il complète le vocabulaire.
//
// LE CRÉDIT FAIT PARTIE DE LA CARTE. Une fan art sans son autrice n'est pas une
// carte de moins bien créditée : c'est une œuvre prise sans le dire. Le nom à
// afficher est donc une donnée de premier ordre (`artistName`), saisie par la
// proposante — son pseudo de compte n'est pas forcément sa signature.
//
// UNE PLACE DE DÉCOR, PAS UNE PLACE DE JOUEUSE. Le paquet garde sa composition
// (« trois joueuses, une équipe, une carte de décor ») : la fan art partage
// l'emplacement de la map, jamais celui d'une joueuse. `drawPack.ts` le dit
// depuis toujours — les maps « ne doivent jamais évincer une joueuse d'un
// paquet, seulement occuper une place que personne ne réclame ». Une fan art
// non plus.

import type { TcgRarity } from './rarity';

export const FANART_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'revoked',
] as const;
export type FanartStatus = (typeof FANART_STATUSES)[number];

/** Propositions EN ATTENTE autorisées par personne et par espace. */
export const MAX_PENDING_FANART = 3;

/** Bornes de saisie, alignées sur les CHECK de `tcg_fanart_cards`. */
export const FANART_LIMITS = {
  title: 80,
  artistName: 80,
  artistUrl: 300,
  reviewNotes: 500,
} as const;

/**
 * Rareté proposée par défaut à la validation.
 *
 * `rare` et non `common` : une fan art est unique par construction — quelqu'un
 * l'a dessinée — et le staff peut monter (ou descendre) au cas par cas. Ce
 * n'est PAS une échelle parallèle de prestige : c'est la même échelle
 * (`utils/tcg/rarity.ts`), choisie à la main faute de palmarès à mesurer,
 * exactement comme la rareté fixe des maps.
 */
export const DEFAULT_FANART_RARITY: TcgRarity = 'rare';

/**
 * Part des paquets où la carte de décor est une fan art, quand l'espace en a.
 *
 * UNE SUR DEUX. En dessous, une fan art validée ne se voit presque jamais et le
 * geste de l'autrice reste sans écho ; au-dessus, les maps disparaissent du
 * TCG. La valeur se lit ici et nulle part ailleurs.
 */
export const FANART_DECOR_SHARE = 0.5;

/**
 * Part des paquets où la carte de décor est une MASCOTTE, quand le registre en
 * contient.
 *
 * UNE SUR QUATRE, soit la moitié de la part des fan arts. Les deux ne jouent
 * pas le même rôle : une fan art est le geste d'une autrice, qui perd son sens
 * si personne ne la voit, alors que les mascottes sont un fonds permanent de
 * quinze figurines qui ne demande rien. Leur donner autant de place que les
 * fan arts aurait repoussé maps ET fan arts à un quart chacune.
 */
export const MASCOT_DECOR_SHARE = 0.25;

/**
 * La carte de décor de ce paquet : une map, une fan art, ou une mascotte.
 *
 * `roll` dans [0, 1) — même convention que `isFoil` : l'aléa entre par un
 * paramètre, jamais par `Math.random()` ici, pour que le tirage reste
 * reproductible et testable.
 *
 * LES PARTS SE LISENT DANS L'ORDRE, chacune sur le segment qui lui revient :
 * fan art en premier (0 → 0,5), mascotte ensuite (0,5 → 0,75), map pour le
 * reste. Quand un vivier manque, sa part revient aux autres au lieu de
 * produire un trou — un paquet ne doit jamais sortir avec un décor vide alors
 * qu'un vivier était disponible.
 *
 * UN TIRAGE ABSENT OU ABERRANT REND « map » : c'est le comportement d'avant
 * les fan arts. Un doute ne doit pas faire apparaître une carte d'un type
 * nouveau.
 */
export function pickDecorKind(input: {
  roll: number;
  hasFanart: boolean;
  hasMaps: boolean;
  /** Le registre des mascottes ; absent = comportement d'avant les mascottes. */
  hasMascots?: boolean;
}): 'map' | 'fanart' | 'mascot' | 'none' {
  const hasMascots = input.hasMascots === true;
  if (!input.hasFanart && !input.hasMaps && !hasMascots) return 'none';

  const safe =
    Number.isFinite(input.roll) && input.roll >= 0 && input.roll < 1
      ? input.roll
      : 1;

  // Un seul vivier disponible : il prend tout, le tirage ne sert à rien.
  if (!input.hasFanart && !hasMascots) return 'map';
  if (!input.hasMaps && !hasMascots) return 'fanart';
  if (!input.hasFanart && !input.hasMaps) return 'mascot';

  // Deux viviers sur trois : la part du manquant revient au vivier de repli,
  // qui est la map quand elle existe, sinon le premier disponible.
  if (!hasMascots) return safe < FANART_DECOR_SHARE ? 'fanart' : 'map';
  if (!input.hasFanart) return safe < MASCOT_DECOR_SHARE ? 'mascot' : 'map';
  if (!input.hasMaps) {
    return safe < FANART_DECOR_SHARE ? 'fanart' : 'mascot';
  }

  // Les trois : segments successifs.
  if (safe < FANART_DECOR_SHARE) return 'fanart';
  if (safe < FANART_DECOR_SHARE + MASCOT_DECOR_SHARE) return 'mascot';
  return 'map';
}

/** Une fan art, telle que la lisent le tirage, les faces et les crédits. */
export type FanartCard = {
  id: string;
  title: string;
  artistName: string;
  artistUrl: string | null;
  imageUrl: string | null;
  rarity: TcgRarity;
};

/**
 * Le lien d'une autrice est-il affichable ?
 *
 * On n'affiche QUE http(s) : un `javascript:` ou un `data:` transformerait un
 * crédit en vecteur d'attaque, sur une page que tout le monde peut ouvrir.
 * (La validation à l'écriture passe déjà par `sanitizeUrl` ; ce garde-fou vaut
 * pour les lignes écrites avant lui.)
 */
export function displayableArtistUrl(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
