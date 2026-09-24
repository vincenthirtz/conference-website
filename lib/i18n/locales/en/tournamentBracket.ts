// lib/i18n/locales/en/tournamentBracket.ts
//
// Traductions ANGLAISES du namespace `tournamentBracket`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentBracket.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: "Bracket – {name} | OW Women's Cup",
  heading: 'Bracket – {name}',
  description:
    "The tournament tree: follow every team's run, round by round, all the way to the final.",
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  emptyTitle: 'Bracket coming soon',
  emptyBody:
    "The tournament tree isn't published yet. In the meantime, check the match list.",
  viewMatches: 'View matches',
  finalsHeading: 'Finals – {name}',
  finalsDescription:
    'The top {count} of the regular season qualify: 1st vs 2nd in the grand final, 3rd vs 4th in the third-place match.',
  finalsProjected: 'If the season ended tonight',
  finalsConfirmed: 'Confirmed matchup',
  finalsNotStarted: 'Matchups will take shape after the first matchday.',
  finalsSeed: '#{rank} of the season',
  finalsSeedFirst: '#1 of the season',
  finalsTbd: 'To be decided',
  finalsVs: 'vs',
  finalsWatchMatch: 'View match',
  raceTitle: 'Race to the finals',
  raceSubtitle:
    '“Qualified” and “eliminated” only show once settled on points, tiebreakers excluded.',
  raceSubtitleOver: 'Regular season over: matchups are set.',
  raceColTeam: 'Team',
  raceColPoints: 'Pts',
  raceColRemaining: 'Left',
  raceColMax: 'Max',
  raceColStatus: 'Status',
  raceQualified: 'Qualified',
  raceEliminated: 'Eliminated',
  raceContention: 'In contention',
  raceCutLine: 'Qualification line',
  raceRemainingTitle: '{count} match(es) left',
  raceMaxTitle: 'Points reachable by winning every remaining match',
  raceSeeStandings: 'Full standings',
  finalsEmptyTitle: 'Finals coming soon',
  finalsEmptyBody:
    'Finals matches are not scheduled yet. In the meantime, follow the standings.',
};
