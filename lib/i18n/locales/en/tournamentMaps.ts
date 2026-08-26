// lib/i18n/locales/en/tournamentMaps.ts
//
// Traductions ANGLAISES du namespace `tournamentMaps`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentMaps.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: "Top maps – {name} | OW Women's Cup",
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  heading: 'Top maps – {name}',
  description:
    'An overview of the most played maps of the tournament, with the number of rounds, overtimes and tiebreakers. Handy for casters, analysts and strat-callers.',
  backToTournament: '← Back to tournament',
  allMatches: 'All matches',
  viewBracket: 'View bracket',
  emptyGames:
    'No game recorded for this tournament yet. Map stats will appear as results come in.',
  poolHeading: 'Tournament map pool',
  poolSubtitle:
    'The maps playable in this tournament, by mode. Thumbnails are models we made ourselves.',
  poolCount_one: '{count} map',
  poolCount_other: '{count} maps',
  poolModeControl: 'Control',
  poolModeEscort: 'Escort',
  poolModeHybrid: 'Hybrid',
  poolModePush: 'Push',
  poolModeFlashpoint: 'Flashpoint',
  poolModeOther: 'Other',
  statDistinctMaps: 'Distinct maps',
  statGamesPlayed: 'Games played',
  statOvertimes: 'Overtimes',
  statTiebreakers: 'Tiebreakers',
  statTotalBans: 'Total bans',
  statMostBanned: 'Most banned map',
  hintBans: '{count} bans',
  top3Heading: 'Top 3 maps of the tournament',
  allMapsHeading: 'All played maps',
  colMap: 'Map',
  colGames: 'Games',
  colAvgRounds: 'Avg rounds',
  colOvertimes: 'Overtimes',
  colBans: 'Bans',
  colPicks: 'Picks',
  colWinrates: 'Winrates',
  winLossAbbrev: '({wins}W-{losses}L)',
  note: 'Note: stats are computed from the games recorded for this tournament, excluding bye matches.',
  rankMapFirst: '1st map',
  rankMapSecond: '2nd map',
  rankMapThird: '3rd map',
  gamesCount_one: '{count} game',
  gamesCount_other: '{count} games',
  avgRoundsLabel: 'Average rounds:',
  overtimesLabel: 'Overtimes:',
  bansLabel: 'Bans:',
  picksLabel: 'Picks:',
};
