// lib/i18n/locales/fr/playerErrors.ts
//
// Traductions FRANCAISES du namespace `playerErrors` — SOURCE DE VERITE.
// Un message par code du catalogue `PLAYER_ERROR_CODES` (utils/player/errors.ts,
// lot P4) : le client affiche le message du `code` et garde le texte serveur
// `error` en repli pour les codes historiques hors catalogue.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerErrors', {
  validation: 'Certains champs sont invalides.',
  unauthenticated: 'Ta session a expiré, reconnecte-toi.',
  forbidden: "Tu n'as pas les droits pour cette action.",
  not_found: 'Introuvable.',
  conflict: 'Cette action entre en conflit avec l’état actuel.',
  precondition: "Cette action n'est plus possible dans l'état actuel.",
  rate_limited: 'Trop de tentatives, réessaie dans un instant.',
  method_not_allowed: 'Action non prise en charge.',
  service_unavailable: 'Service momentanément indisponible.',
  internal: 'Une erreur est survenue.',
  invalid_subject: 'Profil inspecté invalide.',
  subject_read_only: 'Inspection en lecture seule : action impossible.',
  subject_forbidden: 'Tu ne peux pas inspecter ce profil.',
  subject_not_found: 'Profil inspecté introuvable.',
  subject_unsupported: "L'inspection n'est pas disponible ici.",
});
