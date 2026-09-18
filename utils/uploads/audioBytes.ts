// utils/uploads/audioBytes.ts
//
// Validation d'un SON d'alerte reçu en base64, destiné à un bucket PUBLIC.
//
// POURQUOI UN MODULE À PART, ET PAS UNE LIGNE DANS `mediaBytes.ts`. Celui-là
// sert l'habillage d'overlay — une image ou une vidéo. Y ajouter l'audio
// élargirait la surface de TOUTES ses appelantes, dont l'habillage du TCG, qui
// n'a aucune raison d'accepter un fichier son. On compose, comme `mediaBytes`
// compose déjà avec `imageBytes` : chaque module garde une règle lisible.
//
// LES MAGIC BYTES, MÊME RAISON QUE POUR LES IMAGES ET LES VIDÉOS. Le `mimeType`
// d'une requête est une affirmation du client. Sans vérification du contenu
// réel, n'importe quel fichier atterrit dans un bucket public en se déclarant
// `audio/mpeg`.
//
// PÉRIMÈTRE : MP3, OGG, WAV. Ce sont les trois que tout navigateur — donc la
// source OBS, qui EST un navigateur — lit sans codec supplémentaire. En
// accepter d'autres produirait une alerte muette en plein direct, sans erreur
// visible, ce qui est pire qu'un refus à l'envoi.
//
// POURQUOI 2 MIO. Un son d'alerte dure une à trois secondes. Au-delà, ce n'est
// plus un son d'alerte mais un morceau — et il se télécharge AVANT de pouvoir
// être joué, donc il se paie sur la première alerte de la soirée.

/** Extension de fichier par type audio accepté. */
export const AUDIO_EXT_BY_MIME: Readonly<Record<string, string>> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
};

export const AUDIO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Le contenu correspond-il vraiment au type audio déclaré ?
 *
 * MP3 : DEUX débuts légitimes, et c'est le piège du format. Un fichier tagué
 * commence par « ID3 » ; un fichier sans tag commence directement par une
 * trame, dont la synchro est `FF` suivi d'un octet dont les trois bits hauts
 * sont à 1 (`E0` masqué). Ne tester que « ID3 » refuserait des MP3 parfaitement
 * valides — et ne tester que la synchro refuserait la majorité des fichiers
 * exportés par un éditeur audio.
 *
 * OGG : « OggS » en tête.
 * WAV : conteneur RIFF — « RIFF » en tête, puis « WAVE » en octets 8 à 11. Le
 * second contrôle compte : un WebP commence AUSSI par « RIFF ».
 */
export function hasAudioMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
    if (buffer.length < 3) return false;
    const tagged =
      buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33; // ID3
    const frameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    return tagged || frameSync;
  }

  if (mimeType === 'audio/ogg') {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x4f && // O
      buffer[1] === 0x67 && // g
      buffer[2] === 0x67 && // g
      buffer[3] === 0x53 // S
    );
  }

  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
    return (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x41 && // A
      buffer[10] === 0x56 && // V
      buffer[11] === 0x45 // E
    );
  }

  return false;
}

export type DecodedAudio =
  | { ok: true; buffer: Buffer; ext: string }
  | { ok: false; code: string };

/**
 * Décode et valide un son base64 (avec ou sans préfixe `data:`).
 *
 * Rend un `code` stable plutôt qu'un message — même contrat que
 * `decodeImagePayload` et `decodeMediaPayload` : la traduction appartient à
 * l'appelant, seul à connaître la langue de la personne en face.
 */
export function decodeAudioPayload(
  data: unknown,
  mimeType: unknown
): DecodedAudio {
  if (typeof data !== 'string' || typeof mimeType !== 'string') {
    return { ok: false, code: 'missing_data' };
  }

  const ext = AUDIO_EXT_BY_MIME[mimeType];
  if (!ext) return { ok: false, code: 'unsupported_type' };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64');
  } catch {
    return { ok: false, code: 'invalid_base64' };
  }

  // Un base64 illisible ne lève pas : il produit un tampon vide ou tronqué.
  if (buffer.length === 0) return { ok: false, code: 'invalid_base64' };
  if (buffer.length > AUDIO_MAX_BYTES) return { ok: false, code: 'too_large' };
  if (!hasAudioMagicBytes(buffer, mimeType)) {
    return { ok: false, code: 'content_mismatch' };
  }

  return { ok: true, buffer, ext };
}
