// lib/i18n/locales/en/tournamentStats.ts
//
// Traductions ANGLAISES du namespace `tournamentStats`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentStats.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: "Team stats – {name} | OW Women's Cup",
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  heading: 'Team stats – {name}',
  description:
    'Ranking of the teams in this tournament by their wins, map difference and consistency. Perfect to prepare a cast or a desk analysis.',
  backToTournament: '← Back to tournament',
  allMatches: 'All matches',
  topMaps: 'Top maps',
  mvp: 'MVP',
  bracket: 'Bracket',
  empty:
    'No statistic is available for this tournament yet. Stats will appear as soon as matches are played and recorded.',
  statTeams: 'Teams',
  statMatchesPlayed: 'Matches played',
  hintParticipations: '{count} participations in total',
  statTopWinrate: 'Top winrate',
  statBestMapDiff: 'Best map diff',
  top3Heading: 'Top 3 teams of the tournament',
  fullRankingHeading: 'Full team ranking',
  colTeam: 'Team',
  colMatches: 'Matches',
  colWins: 'W',
  colLosses: 'L',
  colWinrate: 'Winrate',
  colMaps: 'Maps (+/-)',
  note: 'Statistics are computed from the matches played in this tournament, excluding matches automatically won by bye.',
  rankTeamFirst: '1st team',
  rankTeamSecond: '2nd team',
  rankTeamThird: '3rd team',
  winratePct: '{rate}% win rate',
  matchesLabel: 'Matches:',
  wdLabel: 'W/L:',
  mapsLabel: 'Maps:',
};
