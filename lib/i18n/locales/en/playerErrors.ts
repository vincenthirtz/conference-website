// lib/i18n/locales/en/playerErrors.ts
//
// Traductions ANGLAISES du namespace `playerErrors`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerErrors.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.

export default {
  validation: 'Some fields are invalid.',
  unauthenticated: 'Your session expired, please sign in again.',
  forbidden: "You don't have permission for this action.",
  not_found: 'Not found.',
  conflict: 'This action conflicts with the current state.',
  precondition: 'This action is no longer possible in the current state.',
  rate_limited: 'Too many attempts, try again in a moment.',
  method_not_allowed: 'Action not supported.',
  service_unavailable: 'Service temporarily unavailable.',
  internal: 'Something went wrong.',
  invalid_subject: 'Invalid inspected profile.',
  subject_read_only: 'Read-only inspection: action not allowed.',
  subject_forbidden: "You can't inspect this profile.",
  subject_not_found: 'Inspected profile not found.',
  subject_unsupported: 'Inspection is not available here.',
};
