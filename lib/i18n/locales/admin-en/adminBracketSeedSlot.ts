// lib/i18n/locales/admin-en/adminBracketSeedSlot.ts
//
// Traductions ANGLAISES du namespace admin `adminBracketSeedSlot`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminBracketSeedSlot.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  available: 'Available',
  emptySlot: 'Empty slot',
  searchPlaceholder: 'Search for a team…',
  noTeams: 'No team available',
};
