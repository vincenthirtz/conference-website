// utils/uploads/mediaBytes.ts
//
// Validation d'un média d'habillage d'overlay : une IMAGE ou une VIDÉO courte,
// reçue en base64, destinée à un bucket PUBLIC.
//
// POURQUOI CE MODULE EXISTE À CÔTÉ DE `imageBytes.ts` PLUTÔT QU'EN LUI. Celui-là
// dit explicitement son périmètre — « les images seules (PNG, JPEG, WebP) », et
// motive l'exclusion du SVG. Y ajouter la vidéo élargirait la surface de TOUTES
// ses appelantes (photo de carte joueuse, notamment), qui n'ont aucune raison
// d'accepter un fichier vidéo. On COMPOSE donc : les images passent par lui, la
// vidéo est traitée ici, et la règle de chacun reste lisible séparément.
//
// LES MAGIC BYTES, MÊME RAISON QUE POUR LES IMAGES. Le `mimeType` d'une requête
// est une affirmation du client. Sans vérification du contenu réel, n'importe
// quel fichier atterrit dans un bucket public en se déclarant `video/mp4`.
//
// PÉRIMÈTRE VIDÉO : MP4 et WebM. Pas de GIF (c'est une image animée : elle
// passe par le chemin image), pas de conteneurs exotiques. Ces deux-là sont ce
// qu'un navigateur — donc la source OBS, qui EST un navigateur — sait lire sans
// codec supplémentaire. En accepter d'autres produirait un rectangle noir en
// plein direct, ce qui est pire qu'un refus à l'envoi.
//
// MAIS LE CONTENEUR NE DIT PAS TOUT, et ce paragraphe l'a longtemps laissé
// croire. Le 2026-09-23, un WebM au format irréprochable a fait échouer la
// boîte d'alertes en plein direct : son encodage interne (VP9 profil 1 AVEC
// canal alpha) est indécodable par le navigateur embarqué d'OBS, alors que
// Chrome de bureau le lit sans broncher. Le type MIME et les magic bytes
// passaient tous les deux. D'où le contrôle d'encodage ci-dessous, dont
// `webmCodec.ts` porte le détail et les mesures.
//
// POURQUOI UN PLAFOND VIDÉO PLUS HAUT, MAIS PAS TRÈS HAUT. Un habillage
// d'overlay est un court élément décoratif, pas un extrait. 8 Mio laissent
// largement la place à quelques secondes encodées correctement, et bornent ce
// qu'une source navigateur devra télécharger AVANT le premier affichage — sur
// la connexion montante d'un direct, un fichier lourd se paie deux fois.

import {
  IMAGE_EXT_BY_MIME,
  IMAGE_MAX_BYTES,
  decodeImagePayload,
} from './imageBytes';
import { webmRejectionCode } from './webmCodec';

/** Nature du média, telle que l'overlay devra la rendre (`<img>` ou `<video>`). */
export type MediaKind = 'image' | 'video';

/** Extension de fichier par type vidéo accepté. */
export const VIDEO_EXT_BY_MIME: Readonly<Record<string, string>> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/**
 * 8 Mio. Quatre fois le plafond des images, et pour une raison différente :
 * ici ce n'est pas le poids d'affichage qui compte mais le temps de
 * téléchargement au démarrage de la source OBS.
 */
export const VIDEO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Le contenu correspond-il vraiment au type vidéo déclaré ?
 *
 * MP4 : la signature n'est PAS au tout début. Un fichier ISO-BMFF commence par
 * la taille de la première boîte (4 octets), puis « ftyp » en octets 4 à 7 —
 * d'où le décalage, qui est la faute classique sur ce format.
 *
 * WebM : conteneur Matroska, en-tête EBML `1A 45 DF A3` en tête de fichier.
 */
export function hasVideoMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'video/mp4') {
    return (
      buffer.length >= 12 &&
      buffer[4] === 0x66 && // f
      buffer[5] === 0x74 && // t
      buffer[6] === 0x79 && // y
      buffer[7] === 0x70 // p
    );
  }

  if (mimeType === 'video/webm') {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }

  return false;
}

export type DecodedMedia =
  | { ok: true; buffer: Buffer; ext: string; kind: MediaKind }
  | { ok: false; code: string };

/**
 * Décode et valide un média base64 (avec ou sans préfixe `data:`).
 *
 * Rend un `code` stable plutôt qu'un message — même contrat que
 * `decodeImagePayload` : la traduction appartient à l'appelant, seul à
 * connaître la langue de la personne en face. Les codes des images sont
 * repris tels quels pour que l'interface n'ait qu'une table à tenir.
 */
export function decodeMediaPayload(
  data: unknown,
  mimeType: unknown
): DecodedMedia {
  if (typeof data !== 'string' || typeof mimeType !== 'string') {
    return { ok: false, code: 'missing_data' };
  }

  // Les images passent par le module qui les connaît déjà, y compris son
  // second contrôle sur le conteneur RIFF du WebP.
  if (mimeType in IMAGE_EXT_BY_MIME) {
    const decoded = decodeImagePayload(data, mimeType);
    return decoded.ok ? { ...decoded, kind: 'image' } : decoded;
  }

  const ext = VIDEO_EXT_BY_MIME[mimeType];
  if (!ext) return { ok: false, code: 'unsupported_type' };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64');
  } catch {
    return { ok: false, code: 'invalid_base64' };
  }

  // Un base64 illisible ne lève pas : il produit un tampon vide ou tronqué.
  if (buffer.length === 0) return { ok: false, code: 'invalid_base64' };
  if (buffer.length > VIDEO_MAX_BYTES) return { ok: false, code: 'too_large' };
  if (!hasVideoMagicBytes(buffer, mimeType)) {
    return { ok: false, code: 'content_mismatch' };
  }

  // LES MAGIC BYTES NE SUFFISENT PAS POUR LE WEBM. Un WebM parfaitement formé
  // peut rester indécodable par la source OBS selon son encodage interne — c'est
  // arrivé le 2026-09-23, en plein direct, avec l'habillage du code lui-même.
  // `webmCodec.ts` porte le détail et la matrice de ce qui a été testé.
  if (mimeType === 'video/webm') {
    const rejection = webmRejectionCode(buffer);
    if (rejection) return { ok: false, code: rejection };
  }

  return { ok: true, buffer, ext, kind: 'video' };
}

/**
 * Le plafond applicable à un type donné, pour que l'interface annonce la bonne
 * limite AVANT l'envoi plutôt que de laisser échouer un fichier de 6 Mio en
 * affichant « 2 Mio maximum ».
 */
export function maxBytesForMime(mimeType: string): number {
  return mimeType in IMAGE_EXT_BY_MIME ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
}
