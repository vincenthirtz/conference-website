// utils/tcg/pageCursor.ts
//
// Curseurs de pagination des routes joueuse du TCG (`/api/player/tcg/collection`
// et `/api/player/tcg/packs`).
//
// POURQUOI UN CURSEUR ET PAS UN OFFSET. Une collection bouge PENDANT qu'on la
// parcourt : on ouvre un paquet, on recycle un doublon. Avec un offset, chaque
// insertion en tête décale la suite — la page 2 répète une carte de la page 1,
// ou en saute une. Un curseur « après tel élément » (keyset) reprend exactement
// là où la page précédente s'est arrêtée, quel que soit ce qui a changé avant.
//
// OPAQUE, MAIS PAS SECRET. Le curseur est du JSON en base64url : le client ne
// doit pas le lire ni le fabriquer (d'où l'encodage), mais il ne contient que
// ce que la page précédente lui a DÉJÀ montré — une rareté et un identifiant de
// sujet, ou une date d'attribution et un identifiant de paquet. Jamais une URL
// d'image : une face se relit à chaque affichage (retrait de consentement
// rétroactif, cf. `readCardFaces.ts`), et la figer dans un curseur la ferait
// survivre à un retrait.
//
// VALIDATION STRICTE, PARCE QUE LE CURSEUR DES PAQUETS FINIT DANS UN FILTRE.
// Sa date et son identifiant sont interpolés dans un `.or(...)` PostgREST, dont
// la virgule et les parenthèses sont la syntaxe. Un curseur forgé qui les
// contiendrait réécrirait le filtre ; on n'accepte donc qu'un horodatage et un
// UUID de forme exacte. Tout le reste est un `400 invalid_cursor`, jamais un
// « on ignore et on repart du début » : une pagination qui recommence en silence
// fait boucler un client à l'infini.
//
// PUR : aucun accès base, aucun import serveur. `Buffer` suffit, la route est
// seule à l'importer.

import { RARITY_ORDER, type TcgRarity } from './rarity';

/** Plafond d'une page, commun aux deux routes. */
export const MAX_PAGE_LIMIT = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un `timestamptz` tel que PostgREST le rend (`2026-09-14T10:00:00.123456+00:00`)
 * ou tel qu'un ISO JavaScript l'écrit (`…Z`). Ni virgule ni parenthèse possible.
 *
 * On garde la valeur BRUTE plutôt que de la renormaliser : `toISOString()`
 * tronquerait les microsecondes, et le filtre `granted_at < curseur` sauterait
 * alors les paquets attribués dans la même milliseconde que le dernier affiché.
 */
const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;

/** Slug de map : celui du registre (`config/maps/*`), minuscules et tirets. */
const SUBJECT_KEY_RE = new RegExp(
  `^(?:(?:player|team):${UUID_RE.source.slice(1, -1)}|map:[a-z0-9-]{1,64})$`,
  'i'
);

function encode(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(raw: unknown): Record<string, unknown> | null {
  // Un curseur est court : au-delà, c'est autre chose qu'un curseur émis ici.
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) {
    return null;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8')
    );
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Limite                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Lit le paramètre `limit`.
 *
 * - absent → `null` (l'appelant applique son défaut) ;
 * - entier dans [1, MAX_PAGE_LIMIT] → ce nombre ;
 * - autre chose → `'invalid'`. On refuse plutôt que de borner en silence : un
 *   `limit=5000` accepté et servi à 200 laisserait croire au client qu'il a
 *   tout reçu.
 */
export function parsePageLimit(raw: unknown): number | null | 'invalid' {
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw)) return 'invalid';
  const n = Number(raw);
  return n >= 1 && n <= MAX_PAGE_LIMIT ? n : 'invalid';
}

/* -------------------------------------------------------------------------- */
/* Collection : (rareté décroissante, clé de sujet croissante)                 */
/* -------------------------------------------------------------------------- */

export type CollectionCursor = { rarity: TcgRarity; key: string };

export function encodeCollectionCursor(c: CollectionCursor): string {
  return encode({ r: c.rarity, k: c.key });
}

export function decodeCollectionCursor(raw: unknown): CollectionCursor | null {
  const obj = decode(raw);
  if (!obj) return null;
  const { r, k } = obj;
  if (typeof r !== 'string' || !(RARITY_ORDER as readonly string[]).includes(r))
    return null;
  if (typeof k !== 'string' || !SUBJECT_KEY_RE.test(k)) return null;
  return { rarity: r as TcgRarity, key: k };
}

/**
 * Ordre TOTAL de la collection : les plus rares d'abord, puis la clé de sujet.
 *
 * Le second critère n'est pas cosmétique. Trier sur la rareté seule laisse les
 * ex æquo dans l'ordre de lecture de la base, qui n'est pas garanti d'un appel à
 * l'autre : la page 2 pourrait alors répéter ou omettre une carte de même
 * rareté que la dernière de la page 1. Un curseur n'a de sens que sur un ordre
 * sans égalité.
 */
export function compareCollectionOrder(
  a: CollectionCursor,
  b: CollectionCursor
): number {
  const ra = RARITY_ORDER.indexOf(a.rarity);
  const rb = RARITY_ORDER.indexOf(b.rarity);
  if (ra !== rb) return rb - ra;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* Paquets : (granted_at décroissant, id décroissant)                          */
/* -------------------------------------------------------------------------- */

export type PacksCursor = { grantedAt: string; id: string };

export function encodePacksCursor(c: PacksCursor): string {
  return encode({ g: c.grantedAt, i: c.id });
}

export function decodePacksCursor(raw: unknown): PacksCursor | null {
  const obj = decode(raw);
  if (!obj) return null;
  const { g, i } = obj;
  if (typeof g !== 'string' || !TIMESTAMP_RE.test(g)) return null;
  if (!Number.isFinite(Date.parse(g.replace(' ', 'T')))) return null;
  if (typeof i !== 'string' || !UUID_RE.test(i)) return null;
  return { grantedAt: g, id: i.toLowerCase() };
}
