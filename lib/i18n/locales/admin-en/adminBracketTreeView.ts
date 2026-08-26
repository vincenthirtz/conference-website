// lib/i18n/locales/admin-en/adminBracketTreeView.ts
//
// Traductions ANGLAISES du namespace admin `adminBracketTreeView`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminBracketTreeView.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  matchCount_one: '{count} match',
  matchCount_other: '{count} matches',
  scoreEditTitle: 'Enter score',
  scoreSave: 'Save',
  scoreSaving: 'Saving…',
  scoreCancel: 'Cancel',
  scoreInvalid: 'Invalid scores: positive integers required.',
  scoreToastSaved: 'Score saved',
  scoreToastError: 'Failed to save score',
};
