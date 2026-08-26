// lib/i18n/locales/admin-en/adminStatsMaps.ts
//
// Traductions ANGLAISES du namespace admin `adminStatsMaps`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStatsMaps.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorUnexpected: 'Unexpected error',
  pageTitle: 'Admin – Map stats',
  back: 'Back to admin dashboard',
  heading: 'Map stats',
  subtitle:
    'Analysis of map performance & popularity (pick rate, attack/defense win rate, match & round volume).',
  exportCsv: 'Export CSV',
  filterMapLabel: 'Map',
  filterMapPlaceholder: 'Map name (e.g. Ascent, Bind…)',
  filterMinMatchesLabel: 'Min. matches',
  sortByLabel: 'Sort by',
  sortMatchesPlayed: 'Matches played',
  sortRoundsPlayed: 'Total rounds',
  sortWinsTeam1: 'Team 1 wins',
  sortWinsTeam2: 'Team 2 wins',
  sortAvgRounds: 'Avg. rounds/match',
  sortMapName: 'Map name',
  orderLabel: 'Order',
  orderDesc: 'Descending',
  orderAsc: 'Ascending',
  filterSubmit: 'Filter',
  loading: 'Loading...',
  mapsCount: 'Maps ({count})',
  tableCaption: 'Computed on the API side from matches and rounds played.',
  emptyState: 'No maps for these filters.',
  thMap: 'Map',
  thMatchesPlayed: 'Matches played',
  thWinsTeam1: 'Team 1 wins',
  thWinsTeam2: 'Team 2 wins',
  thWinrate: 'Win rate T1 / T2',
  thRoundsTotal: 'Total rounds',
  thAvgRounds: 'Avg. rounds/match',
  previous: 'Previous',
  next: 'Next',
  paginationOf: ' of {total}',
};
