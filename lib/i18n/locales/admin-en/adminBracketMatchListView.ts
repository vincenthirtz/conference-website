// lib/i18n/locales/admin-en/adminBracketMatchListView.ts
//
// Traductions ANGLAISES du namespace admin `adminBracketMatchListView`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminBracketMatchListView.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  colTime: 'Time',
  colTeam1: 'Team 1',
  colTeam2: 'Team 2',
  colFormat: 'Format',
  colRound: 'Round',
  colStatus: 'Status',
};
