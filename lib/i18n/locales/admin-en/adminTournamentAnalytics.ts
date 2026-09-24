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
  tierListTitle: 'Tier list',
  tierListSubtitle:
    'Composite : 65 % de matchs gagnés, 35 % de manches gagnées. Seuils fixes — un plateau serré peut n’avoir aucune équipe en S.',
  tierListEmpty: 'Pas encore assez de matchs joués pour classer les équipes.',
  tierTeamTitle:
    '{wins} victoires, {losses} défaites — {maps} de manches gagnées',
  tierUnranked: 'Non classées (moins de {minPlayed} matchs joués) : {teams}.',
  comparatorTitle: 'Comparateur',
  comparatorSubtitle:
    'Deux équipes côte à côte, et leur face-à-face réel dans ce tournoi.',
  comparatorLeft: 'Équipe A',
  comparatorRight: 'Équipe B',
  comparatorMetric: 'Mesure',
  comparatorPlayed: 'Matchs joués',
  comparatorRecord: 'Bilan (V–D)',
  comparatorWinRate: 'Taux de victoire',
  comparatorMaps: 'Manches (gagnées–perdues)',
  comparatorDuel:
    'Face-à-face : {matches} match(s) — {left} {leftWins}, {right} {rightWins} ; manches {leftMaps}–{rightMaps}.',
  comparatorNoDuel:
    'Ces deux équipes ne se sont pas rencontrées dans ce tournoi.',
  comparatorPickTwo: 'Choisissez deux équipes différentes.',
  teamsTitle: 'Teams',
  teamsSubtitle: 'Sorted by win rate, then by wins',
  teamsEmpty: 'No team statistics.',
  colTeam: 'Team',
  colPlayed: 'Played',
  colWins: 'W',
  colLosses: 'L',
  colWinrate: 'Winrate',
  colMaps: 'Maps',
  mapsTitle: 'Maps',
  mapsSubtitle:
    'Picks (veto or per-game entry), veto bans, games played. “Picker wins”: maps won by the team that picked them.',
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
  kpiPickedMaps: 'Maps picked',
  kpiPickerWinRate: 'Picked map → won',
  kpiPickerWinRateHint: '{wins} of {total} picked maps',
  kpiHeroBans: 'Hero bans',
  kpiHeroBansHint: 'over {maps} maps',
  notRecorded:
    'Not recorded for this tournament: {fields}. The matching indicators are hidden.',
  notRecordedDuration: 'game duration',
  notRecordedOvertime: 'overtime',
  notRecordedTiebreaker: 'deciding maps',
  colPickerWins: 'Picker wins',
  heroBansTitle: 'Hero bans',
  heroBansSubtitle:
    '{bans} bans over {maps} maps. “% of maps”: share of maps where the hero was banned.',
  colRole: 'Role',
  colBanRate: '% of maps',
  colBannedBy: 'Banned by',
  roleTank: 'Tank',
  roleDamage: 'Damage',
  roleSupport: 'Support',
  teamBansTitle: 'Bans by team',
  teamBansSubtitle:
    'What each team takes away from its opponents, and what its opponents take away from it — what they fear.',
  colBansMade: 'Its bans',
  colBansReceived: 'Bans received',
  errorUnexpected: 'Unexpected error',
  entryCta: 'Enter a match night',
  entryHeading: 'Match night entry',
  entrySubtitle:
    'For each match of the day: maps played, who picked the map, hero bans and the score of each map. The match score is computed from the maps.',
  entryDayLabel: 'Match night',
  entryMatchCount: '{count} match(es)',
  entryToFill: '{count} to fill in',
  entryNoMatches: 'No match scheduled in this tournament.',
  entryForfeit: 'Forfeit: nothing to fill in.',
  entryTbd: 'Matchup not set yet.',
  entryOpenMatch: 'Open match sheet',
  entryUnsaved: 'Unsaved changes',
  entryRecomputeNote:
    'On save, the match score is recomputed from the maps and the match is marked finished.',
  entryTieWarning: '{count} tied map(s): no winner will be counted for them.',
  entrySaveMatch: 'Save this match',
  entrySaveAll: 'Save the {count} edited matches',
  entrySaving: 'Saving…',
  entrySaved: 'Match saved.',
  entrySavedAll: '{ok} of {total} match(es) saved.',
  entrySaveError: 'Could not save.',
  entryLoadError: 'Could not load matches.',
};
