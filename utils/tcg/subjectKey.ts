// utils/tcg/subjectKey.ts
//
// « De quel sujet parle cette carte ? » — une seule fois, pour tout le monde.
//
// POURQUOI CE MODULE EXISTE. Cinq lecteurs posaient la même question à leur
// façon : la collection, le recyclage, la route bot, la vue d'ensemble staff et
// l'ouverture de paquet. Chacun écrivait son ternaire
// `kind === 'player' ? card_user_id : card_team_id`. Tant qu'il n'y avait que
// deux sujets, cinq copies d'une même ligne se toléraient ; l'arrivée des maps
// aurait demandé cinq modifications identiques, dont une seule oubliée aurait
// suffi à compter une carte de map comme une carte d'équipe sans sujet. Ce
// dépôt a déjà payé quatre fois ce travers (listes de plans, seuils de badges,
// barèmes de rareté, pool de maps) : une source, donc.
//
// ET LE PIÈGE S'EST REFERMÉ QUAND MÊME, le 2026-09-20 : les cartes MASCOTTE
// ont été ajoutées au tirage, à la base et à l'affichage sans que ce `switch`
// les connaisse. Il rendait donc `null`, et chaque appelant les SAUTAIT en
// silence — invisibles dans la collection, dans le recyclage, dans la vue
// staff. Rien n'échouait : les cartes n'existaient simplement pour personne.
// Ajouter un type de carte impose de passer ici, et ce commentaire est là pour
// que la prochaine fois on le sache avant de le découvrir.
//
// PUR, SANS ENTRÉE-SORTIE. Il ne lit rien : il interprète une ligne déjà lue.

/**
 * LES TYPES DE CARTE, une fois pour tout le dépôt.
 *
 * Cette liste n'existait pas : chaque lecteur réécrivait sa propre union
 * `'player' | 'team' | 'map'`, et le 2026-09-20 il a fallu en corriger dix,
 * une par une, parce que les mascottes n'y figuraient dans aucune. Rien
 * n'échouait — les cartes disparaissaient simplement, ou tombaient dans le
 * `return` final d'un lecteur et ressortaient déguisées en équipe.
 *
 * L'ORDRE EST CELUI DU TIRAGE : les trois sujets du site d'abord, puis les
 * deux qui se partagent l'emplacement de décor.
 */
export const TCG_CARD_KINDS = [
  'player',
  'team',
  'map',
  'fanart',
  'mascot',
] as const;

export type TcgCardKind = (typeof TCG_CARD_KINDS)[number];

/**
 * La colonne qui porte le sujet, par type.
 *
 * C'EST LA PIÈCE QUI REND L'OUBLI IMPOSSIBLE. Le `Record` est exhaustif sur
 * `TcgCardKind` : ajouter un type sans dire quelle colonne le porte ne compile
 * plus. Avant, on ajoutait une branche à un `switch` — et en oublier une ne
 * coûtait qu'un `null` silencieux.
 */
export const CARD_SUBJECT_COLUMN = {
  player: 'card_user_id',
  team: 'card_team_id',
  map: 'card_map_slug',
  fanart: 'card_fanart_id',
  mascot: 'card_mascot_slug',
} as const satisfies Record<TcgCardKind, keyof CardSubjectRow>;

/** La part « sujet » d'une ligne de `tcg_pack_cards`. */
export type CardSubjectRow = {
  subject_kind: string;
  card_user_id?: string | null;
  card_team_id?: string | null;
  card_map_slug?: string | null;
  card_fanart_id?: string | null;
  card_mascot_slug?: string | null;
};

/** `true` si ce `subject_kind` est un type que le code connaît. */
export function isTcgCardKind(value: string): value is TcgCardKind {
  return (TCG_CARD_KINDS as readonly string[]).includes(value);
}

/**
 * L'identifiant du sujet, quel que soit son type — ou `null`.
 *
 * `null` signale une ligne SANS sujet exploitable. Le CHECK
 * `tcg_pack_cards_subject_exclusif` rend cet état impossible en base : le
 * rencontrer est donc le signe d'une corruption ou d'un `subject_kind` inconnu
 * du code (une carte écrite par une version plus récente). Les appelants la
 * sautent plutôt que d'afficher une carte vide — ne jamais forcer une valeur
 * ici, ce serait inventer un sujet.
 */
export function cardSubjectId(row: CardSubjectRow): string | null {
  // Plus de `switch` : la correspondance est une donnée (`CARD_SUBJECT_COLUMN`),
  // exhaustive par le type. Une branche oubliée ne rendait qu'un `null` de
  // plus, que chaque appelant traduisait en « carte sautée, en silence ».
  if (!isTcgCardKind(row.subject_kind)) return null;
  return row[CARD_SUBJECT_COLUMN[row.subject_kind]] ?? null;
}

/**
 * La clé d'agrégation d'un sujet : `<type>:<identifiant>`.
 *
 * Un slug de map et un UUID d'équipe ne peuvent pas se confondre en pratique,
 * mais préfixer par le type rend la collision impossible par CONSTRUCTION
 * plutôt que par chance, et la clé reste lisible dans un journal.
 *
 * Rend `null` quand la ligne n'a pas de sujet, pour que l'appelant décide —
 * fabriquer une clé « inconnu » regrouperait des cartes sans rapport.
 */
export function cardSubjectKey(row: CardSubjectRow): string | null {
  const id = cardSubjectId(row);
  return id ? `${row.subject_kind}:${id}` : null;
}
