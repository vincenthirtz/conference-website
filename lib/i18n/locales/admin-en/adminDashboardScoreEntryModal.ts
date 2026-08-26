// lib/i18n/locales/admin-en/adminDashboardScoreEntryModal.ts
//
// Traductions ANGLAISES du namespace admin `adminDashboardScoreEntryModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDashboardScoreEntryModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  scoresInteger: 'Both scores must be integers ≥ 0.',
  offline: 'Offline: the entry will be sent on reconnection.',
  unexpectedError: 'Unexpected error',
  title: 'Enter the score',
  closeAria: 'Close',
  team1Fallback: 'Team 1',
  team2Fallback: 'Team 2',
  markFinishedBefore: 'Mark the match as ',
  markFinishedStrong: 'finished',
  markFinishedAfter: ' and propagate the bracket',
  cancel: 'Cancel',
  save: 'Save',
};
