// lib/i18n/locales/admin-en/adminTournamentAnalytics.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentAnalytics`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentAnalytics.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Tournament analytics',
  back: '← Back to dashboard',
  heading: 'Tournament analytics',
  tournamentLabel: 'Tournament: ',
  loading: 'Loading...',
  refresh: 'Refresh',
  loadingAnalytics: 'Loading analytics...',
  empty: 'No analytics data for this tournament (no matches played).',
  kpiMatchesPlayed: 'Matches played',
  kpiGamesPlayed: 'Games played',
  kpiAvgDuration: 'Avg. duration / game',
  kpiOvertime: '% Overtime',
  kpiDecisiveGames: '% Decisive games',
  kpiTotalMatches: 'Total matches',
  teamsTitle: 'Teams',
  teamsSubtitle: 'Standings provided by the API',
  teamsEmpty: 'No team statistics.',
  colTeam: 'Team',
  colPlayed: 'Played',
  colWins: 'W',
  colLosses: 'L',
  colWinrate: 'Winrate',
  colMaps: 'Maps',
  mapsTitle: 'Maps',
  mapsSubtitle: 'Picks / bans / games played',
  mapsEmpty: 'No map statistics.',
  colMap: 'Map',
  colPicks: 'Picks',
  colBans: 'Bans',
  colGames: 'Games',
  colAvgDuration: 'Avg. duration',
  colOvertime: '% OT',
  heroesTitle: 'Heroes',
  heroesSubtitle: 'Picks / bans / winrate',
  heroesEmpty: 'No hero statistics.',
  colHero: 'Hero',
  errorUnexpected: 'Unexpected error',
};
