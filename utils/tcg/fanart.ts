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
// l'emplacement de la map (avec les mascottes et les héros), jamais celui
// d'une joueuse. `drawPack.ts` le dit
// depuis toujours — les maps « ne doivent jamais évincer une joueuse d'un
// paquet, seulement occuper une place que personne ne réclame ». Une fan art
// non plus.

import type { OverwatchRole } from '../heroes/overwatch';
import { MEDIA_SUPABASE_BUCKET, mediaPathFromUrl } from '../storage/mediaUrl';
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
 * Part des paquets où la carte de décor est un HÉROS, quand le vivier des
 * héros est ouvert (`utils/tcg/heroCardsReady.ts`).
 *
 * UNE SUR HUIT, PRISE SUR LA PART DES MAPS ET SUR ELLE SEULE. Les parts des fan
 * arts et des mascottes ont chacune leur raison, écrite ci-dessus, et l'arrivée
 * des héros n'en change aucune : une fan art reste vue un paquet sur deux. Les
 * héros et les maps sont, eux, le décor du JEU — ils se partagent ce qui reste,
 * à parts égales quand fan arts et mascottes sont là (un huitième chacun).
 *
 * Le prix est assumé : une map sort deux fois moins souvent qu'avant les
 * héros. Leur donner un quart aurait fait disparaître les maps du TCG.
 */
export const HERO_DECOR_SHARE = 0.125;

/**
 * Les types de carte de DÉCOR, dans l'ordre où le tirage lit leurs parts.
 *
 * La map ferme la marche parce qu'elle est le vivier de REPLI : elle prend
 * tout ce que les autres parts laissent. C'est ce qui rend l'ajout d'un type
 * inoffensif : un vivier vide ne prend aucun segment, et le tirage d'avant se
 * retrouve à l'identique.
 */
export const DECOR_KINDS = ['fanart', 'mascot', 'hero', 'map'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** La part fixe de chaque type de décor ; la map n'en a pas, elle prend le reste. */
const DECOR_SHARES: Record<Exclude<DecorKind, 'map'>, number> = {
  fanart: FANART_DECOR_SHARE,
  mascot: MASCOT_DECOR_SHARE,
  hero: HERO_DECOR_SHARE,
};

/**
 * La carte de décor de ce paquet : une map, une fan art, une mascotte ou un
 * héros.
 *
 * `roll` dans [0, 1) — même convention que `isFoil` : l'aléa entre par un
 * paramètre, jamais par `Math.random()` ici, pour que le tirage reste
 * reproductible et testable.
 *
 * LES PARTS SE LISENT DANS L'ORDRE DE `DECOR_KINDS`, chacune sur le segment qui
 * lui revient, et SEULEMENT POUR LES VIVIERS DISPONIBLES : fan art (0 → 0,5),
 * mascotte (0,5 → 0,75), héros (0,75 → 0,875), map pour le reste (0,875 → 1).
 * Le vivier de REPLI prend tout ce qui reste : la map quand elle existe, sinon
 * le dernier vivier disponible dans l'ordre. Quand un vivier manque, sa part
 * revient donc au repli au lieu de produire un trou — un paquet ne doit jamais
 * sortir avec un décor vide alors qu'un vivier était disponible.
 *
 * Probabilités résultantes :
 *   - les quatre viviers : fan art 50 %, mascotte 25 %, héros 12,5 %, map 12,5 % ;
 *   - sans fan art : mascotte 25 %, héros 12,5 %, map 62,5 % ;
 *   - sans héros : EXACTEMENT les parts d'avant les héros (50 / 25 / 25).
 *
 * UN TIRAGE ABSENT OU ABERRANT REND LE VIVIER DE REPLI (« map » quand il y a
 * des maps) : c'est le comportement d'avant les fan arts. Un doute ne doit pas
 * faire apparaître une carte d'un type nouveau.
 */
export function pickDecorKind(input: {
  roll: number;
  hasFanart: boolean;
  hasMaps: boolean;
  /** Le registre des mascottes ; absent = comportement d'avant les mascottes. */
  hasMascots?: boolean;
  /** Le registre des héros, s'il est ouvert ; absent = comportement d'avant. */
  hasHeroes?: boolean;
}): DecorKind | 'none' {
  const available: Record<DecorKind, boolean> = {
    fanart: input.hasFanart,
    mascot: input.hasMascots === true,
    hero: input.hasHeroes === true,
    map: input.hasMaps,
  };
  const present = DECOR_KINDS.filter((kind) => available[kind]);
  if (present.length === 0) return 'none';

  const fallback: DecorKind = available.map
    ? 'map'
    : present[present.length - 1];

  const safe =
    Number.isFinite(input.roll) && input.roll >= 0 && input.roll < 1
      ? input.roll
      : 1;

  // Segments successifs. Un seul vivier disponible ne pose aucun segment : il
  // est le repli, il prend tout, et le tirage ne sert à rien.
  let edge = 0;
  for (const kind of present) {
    if (kind === fallback || kind === 'map') continue;
    edge += DECOR_SHARES[kind];
    if (safe < edge) return kind;
  }
  return fallback;
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

/* -------------------------------------------------------------------------- */
/* La catégorie « L'association »                                              */
/* -------------------------------------------------------------------------- */

/**
 * Les catégories d'une carte de `tcg_fanart_cards` (CHECK
 * `tcg_fanart_category_check`, migration `tcg_association_cards.sql`).
 *
 * `association` : les visuels de l'association — logos d'événement et images
 * déposées par le staff. Même table, même type de carte (`fanart`) : tirage,
 * échanges, forge et vitrine les traitent sans une ligne de plus. Seuls
 * l'affichage et la façon d'entrer au catalogue diffèrent.
 */
export const FANART_CATEGORIES = ['fanart', 'association'] as const;
export type FanartCategory = (typeof FANART_CATEGORIES)[number];

/** Une valeur lue en base, ramenée à une catégorie connue. */
export function fanartCategoryOf(raw: unknown): FanartCategory {
  return raw === 'association' ? 'association' : 'fanart';
}

/** Crédit par défaut d'une carte de l'association. */
export const ASSOCIATION_DEFAULT_CREDIT = 'L’association';

/** Préfixe des fichiers de la catégorie dans le bucket TCG. */
export const ASSOCIATION_STORAGE_PREFIX = 'tcg-association';

/** `source_ref` d'un logo d'événement importé. */
export function seasonalLogoSourceRef(logoId: string): string {
  return `seasonal:${logoId}`;
}

/**
 * Les PARTENAIRES de l'association entrent dans la même catégorie : une carte
 * de partenaire est une carte de l'association dont le crédit nomme le
 * partenaire et pointe sur son site (`artist_url`, `https://` seulement — même
 * règle que le crédit d'un logo d'équipe, `utils/teams/logoCredit.ts`).
 *
 * L'origine est notée dans `source_ref` (`partner:<id>`) : un partenaire
 * importé deux fois ne fait pas deux cartes (index unique par espace), et
 * l'écran sait dire d'où vient la carte. Le préfixe tient dans la borne du
 * CHECK (3 à 120 caractères) avec un UUID.
 */
const PARTNER_SOURCE_PREFIX = 'partner:';

/** `source_ref` d'un partenaire importé. */
export function partnerSourceRef(partnerId: string): string {
  return `${PARTNER_SOURCE_PREFIX}${partnerId}`;
}

/** Cette carte vient-elle d'un partenaire ? */
export function isPartnerSourceRef(ref: string | null | undefined): boolean {
  return typeof ref === 'string' && ref.startsWith(PARTNER_SOURCE_PREFIX);
}

/**
 * Le chemin DANS LE BUCKET d'une URL publique Supabase Storage, ou `null`.
 *
 * Un logo d'événement est une URL (upload du back-office → bucket public, ou
 * chemin du site). Seul le premier cas se copie en carte : la carte a besoin
 * d'un objet du bucket qui lui appartienne, pas d'un lien qui pourrait changer.
 *
 * Le bucket média est aussi servi par R2 (`media.owwomenscup.fr`, mêmes
 * clés) : pour lui, une telle adresse donne le même chemin.
 */
export function bucketPathFromPublicUrl(
  url: string,
  bucket: string
): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = url.indexOf(marker);
  if (at === -1) {
    return bucket === MEDIA_SUPABASE_BUCKET ? mediaPathFromUrl(url) : null;
  }
  const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
  if (!path || path.includes('..') || path.startsWith('/')) return null;
  return path;
}

/* -------------------------------------------------------------------------- */
/* Les illustrations ALTERNATIVES d'un héros ou d'une map                      */
/* -------------------------------------------------------------------------- */

/**
 * Une fan art peut viser un HÉROS ou une MAP : elle devient alors une
 * « illustration alternative » de ce sujet (migration
 * `tcg_fanart_targets.sql`, colonnes `target_kind` + `target_slug`).
 *
 * C'EST UNE CARTE EN PLUS, PAS UNE IMAGE QUI REMPLACE. La carte héros ou map,
 * avec sa figurine voxel, reste dans le jeu telle quelle ; la variante est une
 * carte FAN ART à part entière — même sujet `fanart` dans `tcg_pack_cards`,
 * donc tirée, possédée, échangée et recyclée exactement comme les autres. Seule
 * sa face change : le nom de la cible, un badge, le rôle pour un héros, et le
 * crédit de l'autrice. Plusieurs variantes d'un même héros sont autant de
 * cartes distinctes (une ligne de `tcg_fanart_cards` chacune).
 *
 * Seule la catégorie `fanart` (la communauté) prend une cible : une carte de
 * l'association n'illustre pas un héros (CHECK `tcg_fanart_target_category`).
 *
 * Le registre (le slug désigne-t-il un héros, une map ?) est vérifié par
 * `utils/tcg/fanartTargets.ts` ; ce module-ci reste pur et lisible par le
 * navigateur, sans traîner les registres avec lui.
 */
export const FANART_TARGET_KINDS = ['hero', 'map'] as const;
export type FanartTargetKind = (typeof FANART_TARGET_KINDS)[number];

/**
 * Format d'un slug de cible, aligné sur le CHECK `tcg_fanart_target_slug_format`
 * : celui des héros (`soldier76`) comme celui des maps (`kings-row`).
 */
export const FANART_TARGET_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FANART_TARGET_SLUG_MAX = 64;

/** Une cible telle qu'elle est stockée : un type et un slug, rien de plus. */
export type FanartTargetRef = { kind: FanartTargetKind; slug: string };

/**
 * Une cible telle que la face l'affiche, résolue depuis le registre.
 *
 * `name` vaut `null` pour un sujet sorti du registre (même contrat que les
 * cartes héros et mascottes) : la carte retombe alors sur le titre de l'œuvre.
 * `role` n'existe que pour un héros — le mot du JEU (« Tank »…), traduit par
 * l'écran.
 */
export type FanartTargetView = {
  kind: FanartTargetKind;
  slug: string;
  name: string | null;
  role: OverwatchRole | null;
};

export function isFanartTargetKind(v: unknown): v is FanartTargetKind {
  return (FANART_TARGET_KINDS as readonly unknown[]).includes(v);
}

/**
 * Deux colonnes lues en base ramenées à une cible, ou `null`.
 *
 * Les deux ou rien (CHECK `tcg_fanart_target_pair`) : une ligne qui n'aurait
 * que l'une des deux — impossible après la migration, mais un lecteur ne doit
 * pas en dépendre — se lit comme une fan art sans cible.
 */
export function fanartTargetRefOf(
  kind: unknown,
  slug: unknown
): FanartTargetRef | null {
  if (!isFanartTargetKind(kind) || typeof slug !== 'string') return null;
  if (slug.length > FANART_TARGET_SLUG_MAX) return null;
  return FANART_TARGET_SLUG_RE.test(slug) ? { kind, slug } : null;
}

/**
 * Une cible en une chaîne, `hero:mercy` — la forme des clés de sujet
 * (`subjectKey.ts`), et la valeur d'une option des sélecteurs. `''` sans cible.
 */
export function fanartTargetKey(
  ref: { kind: FanartTargetKind; slug: string } | null | undefined
): string {
  return ref ? `${ref.kind}:${ref.slug}` : '';
}

/** `hero:mercy` → la cible ; `null` pour `''` ou une valeur mal formée. */
export function fanartTargetRefFromKey(
  key: string | null | undefined
): FanartTargetRef | null {
  const at = (key ?? '').indexOf(':');
  if (!key || at < 0) return null;
  return fanartTargetRefOf(key.slice(0, at), key.slice(at + 1));
}

/**
 * Le nom à écrire sur une carte fan art : celui de sa cible quand elle en a
 * une (et que le registre la connaît), sinon le titre donné par l'autrice.
 */
export function fanartCardName(card: {
  title: string | null;
  target?: { name: string | null } | null;
}): string | null {
  return card.target?.name ?? card.title;
}
