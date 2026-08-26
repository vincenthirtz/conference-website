// lib/i18n/locales/admin-en/adminStatsTeams.ts
//
// Traductions ANGLAISES du namespace admin `adminStatsTeams`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStatsTeams.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorUnexpected: 'Unexpected error',
  pageTitle: 'Admin – Team stats',
  back: 'Back to admin dashboard',
  heading: 'Team stats',
  countRanked_one: '{total} ranked team',
  countRanked_other: '{total} ranked teams',
  loading: 'Loading...',
  exportCsv: 'Export CSV',
  filterTournamentLabel: 'Tournament',
  tournamentsLoading: 'Loading tournaments…',
  tournamentsAll: 'All tournaments',
  filterMinMatchesLabel: 'Min. matches',
  filterSearchLabel: 'Search',
  filterSearchPlaceholder: 'Name, tag…',
  sortByLabel: 'Sort by',
  sortWinrate: 'Match win rate',
  sortMapWinrate: 'Map win rate',
  sortMatchesPlayed: 'Matches played',
  sortPoints: 'Points',
  sortLastMatch: 'Last match',
  orderLabel: 'Order',
  orderDesc: 'Desc',
  orderAsc: 'Asc',
  filterSubmit: 'Filter',
  emptyState: 'No teams for these filters',
  thTeam: 'Team',
  thTournament: 'Tournament',
  thMatches: 'Matches',
  thWDL: 'W/L/D',
  thWinrate: 'Win rate',
  thMaps: 'Maps',
  thMapWinrate: 'Map WR',
  thPoints: 'Points',
  thLastMatch: 'Last match',
  previous: 'Previous',
  next: 'Next',
  paginationOf: ' of {total}',
};
