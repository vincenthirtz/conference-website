// lib/i18n/locales/en/teamPicker.ts
//
// Traductions ANGLAISES du namespace `teamPicker`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamPicker.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  searchPlaceholder: 'Search for a team...',
  loading: 'Loading...',
  countryLabel: 'Filter by country',
  countryAll: 'All countries',
  membersCount: '{count}/5 members',
  openForScrimBadge: 'looking for a scrim',
};
