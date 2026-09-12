// utils/uploads/imageBytes.ts
//
// Validation d'une image reçue en base64 : type déclaré, poids, et surtout
// CONTENU RÉEL.
//
// POURQUOI VÉRIFIER LES MAGIC BYTES. Le `mimeType` d'une requête est une
// affirmation du client, pas un fait. Sans cette vérification, n'importe quel
// fichier — script, archive, exécutable — peut être déposé dans un bucket
// PUBLIC en se déclarant `image/png`. Les premiers octets d'un fichier, eux,
// ne mentent pas sur son format.
//
// PÉRIMÈTRE : les images seules (PNG, JPEG, WebP). Pas de SVG, volontairement :
// un SVG est un DOCUMENT (scripts, entités XML, références externes), il n'a pas
// de magic bytes et exige un nettoyage à liste blanche. Une photo de profil n'a
// aucune raison d'en être un, et l'exclure supprime toute cette surface.
//
// `pages/api/admin/upload.ts` porte une table plus large (SVG + PDF) et son
// propre nettoyage, antérieurs à ce module ; il n'a pas été basculé ici pour ne
// pas toucher à une route staff en service sans nécessité.

/** Extension de fichier par type accepté. */
export const IMAGE_EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/**
 * 2 Mio, comme les images du panneau d'administration.
 *
 * Au-delà, ce n'est plus une photo de profil : c'est un fichier que personne
 * n'a redimensionné, et qui sera servi tel quel à chaque affichage de carte.
 */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Signatures de début de fichier, par type. */
const MAGIC_BYTES: Readonly<Record<string, number[][]>> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  // WebP = conteneur RIFF : « RIFF » en tête, puis « WEBP » en octets 8-11.
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};

/** Le contenu correspond-il vraiment au type déclaré ? */
export function hasImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;

  const matches = signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte)
  );
  if (!matches) return false;

  // RIFF sert aussi au WAV et à l'AVI : sans ce second contrôle, un fichier
  // audio passerait pour une image.
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50 // P
    );
  }

  return true;
}

export type DecodedImage =
  | { ok: true; buffer: Buffer; ext: string }
  | { ok: false; code: string };

/**
 * Décode et valide une image base64 (avec ou sans préfixe `data:`).
 *
 * Rend un `code` stable plutôt qu'un message : la traduction appartient à
 * l'appelant, qui seul connaît la langue de la personne en face.
 */
export function decodeImagePayload(
  data: unknown,
  mimeType: unknown
): DecodedImage {
  if (typeof data !== 'string' || typeof mimeType !== 'string') {
    return { ok: false, code: 'missing_data' };
  }

  const ext = IMAGE_EXT_BY_MIME[mimeType];
  if (!ext) return { ok: false, code: 'unsupported_type' };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64');
  } catch {
    return { ok: false, code: 'invalid_base64' };
  }

  // Un base64 illisible ne lève pas : il produit un tampon vide ou tronqué.
  if (buffer.length === 0) return { ok: false, code: 'invalid_base64' };
  if (buffer.length > IMAGE_MAX_BYTES) return { ok: false, code: 'too_large' };
  if (!hasImageMagicBytes(buffer, mimeType)) {
    return { ok: false, code: 'content_mismatch' };
  }

  return { ok: true, buffer, ext };
}
