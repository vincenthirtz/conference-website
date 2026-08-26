// lib/i18n/locales/en/existingTeamSelector.ts
//
// Traductions ANGLAISES du namespace `existingTeamSelector`.
//
// La SOURCE DE VERITE est le francais (`../fr/existingTeamSelector.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  searchLabel: 'Search for a team',
  searchPlaceholder: 'Search by name...',
  loading: 'Loading...',
  noTeams: 'No team found',
};
