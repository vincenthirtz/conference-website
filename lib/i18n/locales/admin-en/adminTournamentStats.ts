// lib/i18n/locales/admin-en/adminTournamentStats.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentStats`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentStats.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Tournament statistics',
  back: '← Back to tournament',
  heading: 'Tournament statistics',
  tournamentLabel: 'Tournament: ',
  loading: 'Loading...',
  refresh: 'Refresh',
  loadingStats: 'Loading statistics...',
  kpiTeams: 'Teams',
  kpiTotalMatches: 'Total matches',
  kpiFinished: 'Finished',
  kpiOngoing: 'Ongoing',
  kpiPending: 'Upcoming',
  kpiMapsPlayed: 'Maps played',
  kpiOvertimes: 'Overtimes',
  teamRankingTitle: 'Team standings',
  teamRankingSubtitle: 'By winrate (min. 1 match played)',
  teamsEmpty: 'No team statistics available.',
  colTeam: 'Team',
  colWins: 'W',
  colLosses: 'L',
  colWinrate: 'Winrate',
  colMaps: 'Maps',
  mapStatsTitle: 'Map statistics',
  mapStatsSubtitle: 'By number of games played',
  mapsEmpty: 'No map statistics available.',
  colMap: 'Map',
  colGames: 'Games',
  colUsage: 'Usage',
  colAvgRounds: 'Avg. rounds',
  colOT: 'OT',
  closestTitle: 'Closest matches',
  closestSubtitle: 'Smallest score difference (finished matches)',
  closestEmpty: 'No finished matches.',
  unknownStage: 'Unknown stage',
  roundLabel: ' • Round {n}',
  errorUnexpected: 'Unexpected error',
};
