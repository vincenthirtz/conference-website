// lib/i18n/locales/admin-en/adminTournamentNav.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentNav`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentNav.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  ariaLabel: 'Tournament navigation',
  back: '← Tournament',
  backToList: '← Tournaments',

  tabDashboard: 'Dashboard',
  tabCheckin: 'Check-in',
  tabMatches: 'Matches',
  tabBracket: 'Bracket',
  tabStages: 'Phases',
  tabResults: 'Results',
  tabSettings: 'Settings',
  tabTools: 'Tools',

  subMatchesList: 'List',
  subMatchesSchedule: 'Schedule',
  subMatchesBulk: 'Bulk',
  subSettingsGeneral: 'General',
  subSettingsMaps: 'Map pool',
  subSettingsDiscord: 'Discord',
  subSettingsPrizePool: 'Prize pool',
  subToolsActions: 'Actions',
  subToolsHistory: 'History',

  subCheckinSettings: 'Settings',
  subCheckinLive: 'Live console',
  subBracketView: 'Tree',
  subBracketBuilder: 'Builder',
  subBracketMapDraw: 'Map draw',
  subBracketVeto: 'Veto',
  subStatsOverview: 'Standings',
  subStatsAnalytics: 'Analytics',
  subStatsPodium: 'Podium',

  tabStats: 'Results',
  tabMaps: 'Map pool',
  tabDiscord: 'Discord',
  tabPrizePool: 'Prize pool',
  tabHistory: 'History',
  tabEdit: 'General',
  tabSchedule: 'Schedule',
  tabBulkOps: 'Bulk',
};
