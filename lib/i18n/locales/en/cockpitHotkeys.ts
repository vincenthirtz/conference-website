// lib/i18n/locales/en/cockpitHotkeys.ts
//
// Traductions ANGLAISES du namespace `cockpitHotkeys`.
//
// La SOURCE DE VERITE est le francais (`../fr/cockpitHotkeys.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  sessionExpired: 'Session expired, sign in again.',
  errorWithStatus: 'Error {status}',
  toastHighlight: 'Highlight marked',
  toastScore: 'Score announced',
  toastPause: 'Pause signal sent',
  triggerFailed: 'Unable to trigger the hotkey.',
  scoreLabel: 'Score to announce',
  scorePlaceholder: 'e.g. 2-1 end Game 3',
  validate: 'Submit',
  cancel: 'Cancel',
  title: 'Hotkeys',
  sending: 'Sending...',
  markHighlight: 'Mark a highlight',
  announceScore: 'Announce a score',
  pause: 'Pause',
  disabledHint: 'Hotkeys are available only while a segment is running.',
};
