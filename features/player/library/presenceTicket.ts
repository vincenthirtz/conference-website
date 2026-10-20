// features/player/library/presenceTicket.ts — le JETON DE PRÉSENCE de la
// Women's Library (lot 14a de docs/PLAN-womens-library.md, conference-website).
//
// POURQUOI. La présence temps réel est écrite par les clientes : un client
// modifié peut y annoncer l'identifiant, le pseudo ou le look d'une autre.
// À l'entrée dans une salle, l'API remet donc à la joueuse un jeton SIGNÉ qui
// lie la salle, son compte, son pseudo, son avatar, son look et une échéance.
// Elle le joint à sa présence ; les autres clientes le vérifient (WebCrypto)
// et n'affichent QUE ce qu'il dit, jamais le pseudo ou le look du payload.
// Signaler, bloquer, expulser joignent le jeton de la cible : l'API le
// revérifie (service/presenceTicket.ts).
//
// FORMAT : `<charge>.<signature>`, chacune en base64url sans remplissage.
//   - charge : le JSON `{ v, roomId, userId, nickname, avatarId, look, iat,
//     exp }` en UTF-8 (`iat`, `exp` : secondes epoch, horloge du serveur) ;
//   - signature : ECDSA P-256 / SHA-256 de la CHARGE ENCODÉE (ses caractères
//     ASCII, comme une JWS), en r‖s de 64 octets (IEEE P1363, la forme que
//     WebCrypto produit et vérifie).
// La clé PUBLIQUE (JWK) est rendue par l'entrée ; la privée ne quitte jamais
// l'API.
//
// CE QUE LE JETON NE PROUVE PAS : qu'il est montré par sa titulaire. Il
// circule dans la présence, donc une cliente de la MÊME salle peut le recopier
// jusqu'à son échéance ; elle n'affiche alors que la vraie identité d'une
// joueuse entrée dans cette salle, jamais une identité inventée. D'où une
// échéance courte (2 h), renouvelée par une nouvelle entrée.
//
// Module PUR : ni réseau, ni horloge, ni `Buffer` (recopié dans le site, qui
// le charge à la demande). WebCrypto est REÇU (`subtle`).

import { decodeLibraryLook } from '../../../config/library/avatarLook';
import { LIBRARY_PRESENCE_TICKET_MAX_CHARS } from './socialSchemas';

export const LIBRARY_PRESENCE_TICKET_VERSION = 1;

/** Durée de vie d'un jeton, en secondes (2 h). Entrer de nouveau le renouvelle. */
export const LIBRARY_PRESENCE_TICKET_TTL_SECONDS = 2 * 60 * 60;

export type LibraryPresenceClaims = {
  v: typeof LIBRARY_PRESENCE_TICKET_VERSION;
  roomId: string;
  userId: string;
  nickname: string;
  avatarId: string;
  /** Look composé, forme compacte (config/library/avatarLook.ts), ou null. */
  look: string | null;
  /** Émission et échéance, en secondes epoch (horloge du serveur). */
  iat: number;
  exp: number;
};

/** La clé publique de vérification : un JWK EC P-256, sans `d`. */
export type LibraryPresencePublicKey = {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
};

export const LIBRARY_PRESENCE_KEY_ALGORITHM = {
  name: 'ECDSA',
  namedCurve: 'P-256',
} as const;
export const LIBRARY_PRESENCE_SIGNATURE_ALGORITHM = {
  name: 'ECDSA',
  hash: 'SHA-256',
} as const;

/** Une signature P-256 en r‖s. */
const SIGNATURE_BYTES = 64;
const ID_RE = /^[0-9A-Za-z_-]{1,64}$/;
const AVATAR_RE = /^[a-z0-9_-]{1,32}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
/** Coordonnée d'un point P-256 : 32 octets, 43 caractères base64url. */
const COORD_RE = /^[A-Za-z0-9_-]{43}$/;
const NICKNAME_MAX = 40;
const CLAIM_KEYS = [
  'v',
  'roomId',
  'userId',
  'nickname',
  'avatarId',
  'look',
  'iat',
  'exp',
] as const;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Octets d'un texte base64url, ou null (caractère hors alphabet, longueur impossible). */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (!B64URL_RE.test(text) || text.length % 4 === 1) return null;
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (text.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(padded);
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isSeconds = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Des revendications valides, ou null : EXACTEMENT les clés du format. */
export function parsePresenceClaims(
  value: unknown
): LibraryPresenceClaims | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const rec = value as Record<string, unknown>;
  if (
    Object.keys(rec).length !== CLAIM_KEYS.length ||
    !CLAIM_KEYS.every((k) => Object.hasOwn(rec, k))
  )
    return null;
  const { v, roomId, userId, nickname, avatarId, look, iat, exp } = rec;
  if (v !== LIBRARY_PRESENCE_TICKET_VERSION) return null;
  if (typeof roomId !== 'string' || !ID_RE.test(roomId)) return null;
  if (typeof userId !== 'string' || !ID_RE.test(userId)) return null;
  if (
    typeof nickname !== 'string' ||
    nickname.length < 1 ||
    nickname.length > NICKNAME_MAX
  )
    return null;
  if (typeof avatarId !== 'string' || !AVATAR_RE.test(avatarId)) return null;
  if (
    look !== null &&
    (typeof look !== 'string' || decodeLibraryLook(look) === null)
  )
    return null;
  if (!isSeconds(iat) || !isSeconds(exp) || exp <= iat) return null;
  return {
    v: LIBRARY_PRESENCE_TICKET_VERSION,
    roomId,
    userId,
    nickname,
    avatarId,
    look: look as string | null,
    iat,
    exp,
  };
}

/** La charge d'un jeton : le JSON des revendications (ordre fixe), en base64url. */
export function encodePresenceClaims(claims: LibraryPresenceClaims): string {
  const ordered: LibraryPresenceClaims = {
    v: claims.v,
    roomId: claims.roomId,
    userId: claims.userId,
    nickname: claims.nickname,
    avatarId: claims.avatarId,
    look: claims.look,
    iat: claims.iat,
    exp: claims.exp,
  };
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(ordered)));
}

export type DecodedPresenceTicket = {
  claims: LibraryPresenceClaims;
  /** Ce qui est signé : la charge encodée, en octets ASCII. */
  signingInput: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
};

/** Un jeton DÉCODÉ (forme seulement, signature NON vérifiée), ou null. */
export function decodePresenceTicket(
  ticket: unknown
): DecodedPresenceTicket | null {
  if (
    typeof ticket !== 'string' ||
    ticket.length > LIBRARY_PRESENCE_TICKET_MAX_CHARS
  )
    return null;
  const parts = ticket.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const bytes = base64UrlToBytes(payload);
  const signature = base64UrlToBytes(sig);
  if (!bytes || !signature || signature.length !== SIGNATURE_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  const claims = parsePresenceClaims(json);
  if (!claims) return null;
  return {
    claims,
    signingInput: new TextEncoder().encode(payload) as Uint8Array<ArrayBuffer>,
    signature,
  };
}

/**
 * Les revendications tiennent-elles ? Pas échues à `nowSeconds` (horloge du
 * serveur), et pour la salle / la joueuse attendues quand on les donne.
 */
export function presenceClaimsHold(
  claims: LibraryPresenceClaims,
  expect: { roomId?: string; userId?: string; nowSeconds: number }
): boolean {
  if (claims.exp <= expect.nowSeconds) return false;
  if (expect.roomId !== undefined && claims.roomId !== expect.roomId)
    return false;
  if (expect.userId !== undefined && claims.userId !== expect.userId)
    return false;
  return true;
}

/** Une clé publique de la forme attendue, ou null. */
export function parsePresencePublicKey(
  value: unknown
): LibraryPresencePublicKey | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kty, crv, x, y } = value as Record<string, unknown>;
  if (kty !== 'EC' || crv !== 'P-256') return null;
  if (typeof x !== 'string' || typeof y !== 'string') return null;
  if (!COORD_RE.test(x) || !COORD_RE.test(y)) return null;
  return { kty: 'EC', crv: 'P-256', x, y };
}

/* ------------------------------------------------------ WebCrypto reçu --- */

/** La clé publique, importée pour vérifier (rejette si elle est invalide). */
export function importPresenceKey(
  subtle: SubtleCrypto,
  key: LibraryPresencePublicKey
): Promise<CryptoKey> {
  return subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: key.x, y: key.y },
    LIBRARY_PRESENCE_KEY_ALGORITHM,
    false,
    ['verify']
  );
}

/** La signature d'un jeton décodé est-elle celle de la clé ? Jamais de rejet. */
export async function verifyPresenceSignature(
  subtle: SubtleCrypto,
  key: CryptoKey,
  decoded: DecodedPresenceTicket
): Promise<boolean> {
  try {
    return await subtle.verify(
      LIBRARY_PRESENCE_SIGNATURE_ALGORITHM,
      key,
      decoded.signature,
      decoded.signingInput
    );
  } catch {
    return false;
  }
}

/**
 * Signe des revendications avec une clé privée WebCrypto. L'API signe avec
 * `node:crypto` (service/presenceTicket.ts) ; ceci sert aux tests et aux
 * pages de développement du site.
 */
export async function signPresenceTicket(
  subtle: SubtleCrypto,
  privateKey: CryptoKey,
  claims: LibraryPresenceClaims
): Promise<string> {
  const payload = encodePresenceClaims(claims);
  const signature = await subtle.sign(
    LIBRARY_PRESENCE_SIGNATURE_ALGORITHM,
    privateKey,
    new TextEncoder().encode(payload)
  );
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}
