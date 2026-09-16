// utils/tcg/fanartUploadErrors.ts
//
// Envoi d'une carte FAN ART : ce que le navigateur vérifie AVANT d'envoyer, et
// comment un refus se traduit en message. Module PUR, sans I/O, testé
// (`tests/unit/tcgFanartUpload.test.ts`).
//
// POURQUOI CE MODULE EXISTE. Le panneau de proposition retombait sur « Envoi
// impossible pour le moment. Réessaie. » pour tout ce qu'il ne reconnaissait
// pas — dont le 413 SANS `code` que Next renvoie quand le corps dépasse le
// plafond du bodyParser. Inviter à réessayer un envoi qui ne passera jamais est
// le pire message possible : l'artiste réessaie, échoue, et abandonne. La règle
// est donc écrite ici, là où un test peut la tenir : un refus DÉFINITIF (taille,
// format, contenu, champ invalide) ne se traduit JAMAIS par « réessaie ».
//
// LES PLAFONDS SONT REDÉCLARÉS ICI, à dessein, comme dans
// `components/player/TcgPhotoCard.tsx` : les lire depuis
// `utils/uploads/imageBytes.ts` importerait un module qui manipule `Buffer` et
// ferait entrer un polyfill Node dans le bundle navigateur. Le test vérifie que
// les deux valeurs restent égales ; le serveur reste l'autorité.

/** Miroir de `IMAGE_MAX_BYTES` (utils/uploads/imageBytes.ts), en Mio. */
export const FANART_MAX_MIB = 2;
export const FANART_MAX_BYTES = FANART_MAX_MIB * 1024 * 1024;
/** Miroir des clés de `IMAGE_EXT_BY_MIME`. Sert aussi d'attribut `accept`. */
export const FANART_ACCEPT = 'image/png,image/jpeg,image/webp';
export const FANART_ACCEPTED_TYPES: readonly string[] =
  FANART_ACCEPT.split(',');

/** Clés du namespace `tcgFanart` qu'un refus peut afficher. */
export type FanartErrorKey =
  | 'errorMissingImage'
  | 'errorUnsupportedType'
  | 'errorTooLarge'
  | 'errorContentMismatch'
  | 'errorTitle'
  | 'errorArtistName'
  | 'errorArtistUrl'
  | 'errorLicence'
  | 'errorTooManyPending'
  | 'errorGeneric';

/**
 * Contrôle CLIENT du fichier choisi, ou `null` s'il peut partir.
 *
 * Ne remplace pas le contrôle serveur (magic bytes compris) : il rend le refus
 * LISIBLE et immédiat, sans téléverser 5 Mo pour s'entendre dire non. `type`
 * vide (certains navigateurs pour un format inconnu) = type non supporté.
 */
export function checkFanartFile(
  file: { type: string; size: number } | null | undefined
): FanartErrorKey | null {
  if (!file) return 'errorMissingImage';
  if (!FANART_ACCEPTED_TYPES.includes(file.type)) return 'errorUnsupportedType';
  if (file.size > FANART_MAX_BYTES) return 'errorTooLarge';
  return null;
}

/**
 * Le message d'un refus de `POST /api/player/tcg/fanart`.
 *
 * Le STATUT passe avant le `code` pour le 413 : c'est Next qui le rend, avant
 * le handler, et son corps n'a pas de `code`. Seules les erreurs réellement
 * transitoires (5xx, 429, réponse illisible, code inconnu) retombent sur le
 * message générique qui invite à réessayer.
 */
export function fanartErrorKey(status: number, code: unknown): FanartErrorKey {
  if (status === 413) return 'errorTooLarge';
  switch (code) {
    case 'too_large':
      return 'errorTooLarge';
    case 'unsupported_type':
      return 'errorUnsupportedType';
    case 'content_mismatch':
    case 'invalid_base64':
      return 'errorContentMismatch';
    case 'missing_data':
      return 'errorMissingImage';
    case 'title':
      return 'errorTitle';
    case 'artist_name':
      return 'errorArtistName';
    case 'artist_url':
      return 'errorArtistUrl';
    case 'licence':
      return 'errorLicence';
    case 'too_many_pending':
      return 'errorTooManyPending';
    default:
      return 'errorGeneric';
  }
}
