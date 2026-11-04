// utils/mercato.ts
//
// Vocabulaire du « hub mercato » : les champs que partagent les deux faces du
// marché — la joueuse qui cherche une équipe (`free_players`) et l'équipe qui
// recrute (`team_openings`). Migration `mercato_hub_fields.sql`.
//
// POURQUOI UN MODULE À PART. `utils/freePlayers.ts` et `utils/teamOpenings.ts`
// portent chacun les projections d'UNE table ; ce qui suit vaut pour les deux,
// et doit se lire avec les mêmes mots des deux côtés : une équipe qui cherche
// une « main heal » et une joueuse qui postule « main heal » se rendraient
// invisibles l'une à l'autre si chacune avait sa propre énumération. Le site,
// le bot et l'API lisent ce fichier (le site par la synchro inverse).
//
// Module PUR, sans zod : le site l'importe dans ses composants clients, et zod
// n'a rien à faire dans le premier chargement d'une page publique. Les schémas
// de validation vivent dans `utils/mercatoSchema.ts`.
//
// CODES STABLES, LIBELLÉS AILLEURS. Les valeurs ci-dessous sont écrites en
// base : elles ne changent pas de nom. Les libellés (« Main heal », « Diamant
// 3 », « Manette ») vivent dans l'i18n du site et dans le bot.
//
// AUCUN IMPORT DE `./freePlayers` : ce module-là importe celui-ci (ses
// projections lisent les postes), et un cycle d'imports évalué dans le mauvais
// ordre lit une constante pas encore initialisée. Les deux listes recopiées
// ci-dessous (rôles et paliers historiques) sont confrontées à leur source
// par tests/unit/mercato.test.ts.

/** Rôles historiques (`FREE_PLAYER_ROLES`), dans leur ordre canonique. */
export const MERCATO_LEGACY_ROLES = ['tank', 'dps', 'support', 'flex'] as const;
type LegacyRole = (typeof MERCATO_LEGACY_ROLES)[number];

/**
 * Postes du mercato, plus fins que les rôles historiques (tank/dps/support/
 * flex) : c'est ainsi que les équipes Overwatch recrutent réellement — on ne
 * cherche pas « un DPS », on cherche une hitscan ou une flex DPS.
 */
export const MERCATO_POSITIONS = [
  'tank',
  'hitscan',
  'flex_dps',
  'main_heal',
  'flex_support',
] as const;
export type MercatoPosition = (typeof MERCATO_POSITIONS)[number];

/**
 * Rôle historique de chaque poste. Les rows écrites par le mercato gardent
 * leur colonne `roles` remplie (déduite des postes) : l'espace capitaine, les
 * annonces Discord et l'invitation en un clic lisent encore `roles`, et une
 * fiche sans rôle y deviendrait invisible.
 */
export const POSITION_LEGACY_ROLE: Record<MercatoPosition, LegacyRole> = {
  tank: 'tank',
  hitscan: 'dps',
  flex_dps: 'dps',
  main_heal: 'support',
  flex_support: 'support',
};

/**
 * Genre déclaré par la joueuse. DONNÉE PERSONNELLE : facultative, et
 * `undisclosed` (« préfère ne pas dire ») est la valeur par défaut. Une fiche
 * `undisclosed` (ou NULL, toutes les fiches d'avant le mercato) n'affiche
 * aucun genre et ne répond à aucun filtre de genre.
 */
export const PLAYER_GENDERS = [
  'female',
  'male',
  'non_binary',
  'undisclosed',
] as const;
export type PlayerGender = (typeof PLAYER_GENDERS)[number];
export const DEFAULT_PLAYER_GENDER: PlayerGender = 'undisclosed';

/** Genres qu'une fiche peut AFFICHER (et donc qu'un filtre peut viser). */
export const DISCLOSED_GENDERS = ['female', 'male', 'non_binary'] as const;
export type DisclosedGender = (typeof DISCLOSED_GENDERS)[number];

/**
 * Ce qu'une équipe recherche. Plusieurs choix possibles (une équipe « femmes
 * et personnes non-binaires » est le cas courant du circuit) ; `mixed` dit
 * « équipe mixte, tout le monde est bienvenu ».
 */
export const SOUGHT_GENDERS = [
  'female',
  'male',
  'non_binary',
  'mixed',
] as const;
export type SoughtGender = (typeof SOUGHT_GENDERS)[number];

export const MERCATO_PLATFORMS = ['pc', 'console'] as const;
export type MercatoPlatform = (typeof MERCATO_PLATFORMS)[number];

/** Contrôle : manette, ou clavier-souris (`mkb`). */
export const MERCATO_INPUTS = ['controller', 'mkb'] as const;
export type MercatoInput = (typeof MERCATO_INPUTS)[number];

/**
 * Paliers classés d'Overwatch, du plus bas au plus haut. Ce sont les niveaux
 * historiques (`FREE_PLAYER_LEVELS`) moins `unknown` : le mercato ne crée PAS
 * une seconde échelle — un rang reste stocké dans `level`, et seule la
 * division s'ajoute (`rank_division`). `emerald` est conservé tel que le
 * vocabulaire historique le porte (des fiches existantes peuvent l'avoir).
 */
export const RANK_TIERS = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'master',
  'grandmaster',
  'champion',
] as const;
export type RankTier = (typeof RANK_TIERS)[number];

/** Divisions d'un palier, dans l'ordre du jeu : 5 (bas) → 1 (haut). */
export const RANK_DIVISIONS = [5, 4, 3, 2, 1] as const;
export type RankDivision = (typeof RANK_DIVISIONS)[number];

/** Bornes de saisie, partagées entre la validation et les formulaires. */
export const MERCATO_LIMITS = {
  /** Anciennes équipes / structures, essais passés (texte libre). */
  pastTeams: 300,
  /** « Ce que tu recherches dans une équipe » : 50 mots maximum. */
  goalsWords: 50,
  /** Filet en caractères pour ce même champ (50 mots tiennent largement). */
  goalsChars: 400,
} as const;

function includes<T extends string>(
  list: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === 'string' && (list as readonly string[]).includes(value)
  );
}

export const isMercatoPosition = (v: unknown): v is MercatoPosition =>
  includes(MERCATO_POSITIONS, v);
export const isPlayerGender = (v: unknown): v is PlayerGender =>
  includes(PLAYER_GENDERS, v);
export const isRankTier = (v: unknown): v is RankTier =>
  includes(RANK_TIERS, v);
export const isRankDivision = (v: unknown): v is RankDivision =>
  typeof v === 'number' && (RANK_DIVISIONS as readonly number[]).includes(v);

/**
 * Normalise une liste selon un vocabulaire fermé : garde le connu, déduplique,
 * impose l'ordre canonique du vocabulaire (deux fiches qui cochent les mêmes
 * cases s'affichent pareil). Tolère toute entrée non-tableau.
 */
export function normalizeList<T extends string>(
  vocabulary: readonly T[],
  input: unknown
): T[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set(input.filter((v) => includes(vocabulary, v)));
  return vocabulary.filter((v) => picked.has(v));
}

export const normalizePositions = (input: unknown) =>
  normalizeList(MERCATO_POSITIONS, input);
export const normalizePlatforms = (input: unknown) =>
  normalizeList(MERCATO_PLATFORMS, input);
export const normalizeInputs = (input: unknown) =>
  normalizeList(MERCATO_INPUTS, input);
export const normalizeSoughtGenders = (input: unknown) =>
  normalizeList(SOUGHT_GENDERS, input);

/**
 * Rôles historiques déduits des postes (et du poste principal). Ajoutés aux
 * rôles déjà cochés s'il y en a : on n'efface jamais un rôle qu'une ancienne
 * saisie avait posé.
 */
export function legacyRolesFor(
  positions: readonly MercatoPosition[],
  mainRole?: MercatoPosition | null,
  existing: unknown = []
): LegacyRole[] {
  const derived = [...positions, ...(mainRole ? [mainRole] : [])].map(
    (p) => POSITION_LEGACY_ROLE[p]
  );
  return normalizeList(MERCATO_LEGACY_ROLES, [
    ...(Array.isArray(existing) ? existing : []),
    ...derived,
  ]);
}

/**
 * Compte les mots d'un texte libre. Un mot = une suite sans espace :
 * « j'aime » et « semi-pro » comptent pour un. C'est la règle que le site
 * affiche en direct ET que l'API applique — une seule fonction, pour que le
 * compteur ne laisse jamais passer ce que le serveur refuse.
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

/** Rang de palier (0 = bronze), ou `-1` pour un niveau inconnu. */
export function tierIndex(level: string | null | undefined): number {
  return RANK_TIERS.indexOf(level as RankTier);
}

// ---------------------------------------------------------------------------
// Filtres du hub
// ---------------------------------------------------------------------------
//
// Appliqués côté client sur la liste publique (≤ 120 lignes) : la liste est
// déjà chargée, et un aller-retour serveur par case cochée n'apporterait que
// de la latence. Fonctions pures, testées côté API.
//
// RÈGLE DE LECTURE, ASYMÉTRIQUE ET VOULUE :
//   - une FICHE JOUEUSE décrit un fait. Un champ vide = on ne sait pas : la
//     fiche ne répond pas au filtre (on ne prête pas à quelqu'un ce qu'elle
//     n'a pas dit — en particulier son genre) ;
//   - une ANNONCE D'ÉQUIPE décrit une exigence. Un champ vide = pas
//     d'exigence : l'annonce répond au filtre. Une équipe qui n'a coché ni PC
//     ni console accepte les deux.

export type MercatoFilters = {
  position?: MercatoPosition | null;
  gender?: DisclosedGender | null;
  platform?: MercatoPlatform | null;
  input?: MercatoInput | null;
  /** Bornes de rang (paliers), incluses. Une seule posée = demi-intervalle. */
  rankMin?: RankTier | null;
  rankMax?: RankTier | null;
};

/** Ce que les filtres lisent d'une fiche joueuse (projection publique). */
export type MercatoPlayerFacets = {
  roles: readonly string[];
  positions?: readonly string[] | null;
  mainRole?: string | null;
  gender?: string | null;
  platforms?: readonly string[] | null;
  inputs?: readonly string[] | null;
  level?: string | null;
};

/** Ce que les filtres lisent d'une annonce d'équipe (projection publique). */
export type MercatoOpeningFacets = {
  roles: readonly string[];
  positions?: readonly string[] | null;
  soughtGenders?: readonly string[] | null;
  platforms?: readonly string[] | null;
  inputs?: readonly string[] | null;
  level?: string | null;
  rankMin?: string | null;
  rankMax?: string | null;
};

/**
 * Un poste répond-il ? Les postes fins font foi quand ils existent ; sinon on
 * retombe sur les rôles historiques des rows d'avant le mercato (une hitscan
 * cherchée trouve une ancienne fiche « dps » ; « flex » répond à tout).
 */
function positionMatches(
  position: MercatoPosition,
  positions: readonly string[],
  legacyRoles: readonly string[]
): boolean {
  if (positions.length > 0) return positions.includes(position);
  return (
    legacyRoles.includes(POSITION_LEGACY_ROLE[position]) ||
    legacyRoles.includes('flex')
  );
}

/** Intervalle de paliers [min, max] demandé par le filtre (indices). */
function filterRange(f: MercatoFilters): [number, number] | null {
  if (!f.rankMin && !f.rankMax) return null;
  const lo = f.rankMin ? tierIndex(f.rankMin) : 0;
  const hi = f.rankMax ? tierIndex(f.rankMax) : RANK_TIERS.length - 1;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

/**
 * Paliers qu'une annonce accepte. La fourchette (`rankMin`/`rankMax`) fait
 * foi ; à défaut, le rang moyen recherché (`level`) vaut à un palier près —
 * « rang moyen Diamant » n'exclut pas une Platine haute. `unknown` ou rien :
 * « peu importe », tout répond.
 */
export function openingAcceptedRange(
  o: Pick<MercatoOpeningFacets, 'level' | 'rankMin' | 'rankMax'>
): [number, number] | null {
  const last = RANK_TIERS.length - 1;
  if (o.rankMin || o.rankMax) {
    // Une borne illisible (valeur hors vocabulaire) ne restreint rien.
    const min = tierIndex(o.rankMin);
    const max = tierIndex(o.rankMax);
    const lo = min < 0 ? 0 : min;
    const hi = max < 0 ? last : max;
    return lo <= hi ? [lo, hi] : [hi, lo];
  }
  const avg = tierIndex(o.level);
  if (avg < 0) return null;
  return [Math.max(0, avg - 1), Math.min(last, avg + 1)];
}

export function playerMatchesFilters(
  p: MercatoPlayerFacets,
  f: MercatoFilters
): boolean {
  if (f.position) {
    const mine = [...(p.positions ?? []), ...(p.mainRole ? [p.mainRole] : [])];
    if (!positionMatches(f.position, mine, p.roles)) return false;
  }
  if (f.gender && p.gender !== f.gender) return false;
  if (f.platform && !(p.platforms ?? []).includes(f.platform)) return false;
  if (f.input && !(p.inputs ?? []).includes(f.input)) return false;
  const range = filterRange(f);
  if (range) {
    const idx = tierIndex(p.level);
    if (idx < range[0] || idx > range[1]) return false;
  }
  return true;
}

export function openingMatchesFilters(
  o: MercatoOpeningFacets,
  f: MercatoFilters
): boolean {
  if (f.position && !positionMatches(f.position, o.positions ?? [], o.roles)) {
    return false;
  }
  if (f.gender) {
    const sought = o.soughtGenders ?? [];
    if (
      sought.length > 0 &&
      !sought.includes(f.gender) &&
      !sought.includes('mixed')
    ) {
      return false;
    }
  }
  const platforms = o.platforms ?? [];
  if (f.platform && platforms.length > 0 && !platforms.includes(f.platform)) {
    return false;
  }
  const inputs = o.inputs ?? [];
  if (f.input && inputs.length > 0 && !inputs.includes(f.input)) return false;
  const range = filterRange(f);
  if (range) {
    const accepted = openingAcceptedRange(o);
    if (accepted && (accepted[1] < range[0] || accepted[0] > range[1])) {
      return false;
    }
  }
  return true;
}
