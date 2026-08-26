// lib/i18n/locales/en/tournamentTabs.ts
//
// Traductions ANGLAISES du namespace `tournamentTabs`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentTabs.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  navLabel: 'Tournament navigation',
  hub: 'Overview',
  teams: 'Teams',
  matches: 'Matches',
  bracket: 'Bracket',
  maps: 'Maps',
  stats: 'Stats',
  mvp: 'MVP',
  podium: 'Podium',
  ffa: 'FFA',
};
