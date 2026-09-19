// lib/i18n/locales/en/tournamentStandings.ts
//
// Traductions ANGLAISES du namespace `tournamentStandings`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentStandings.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Standings – {name}',
  description:
    'The official standings, updated with every confirmed result: 3 points per win, ties broken by head-to-head.',
  empty:
    'This tournament has no points-based stage: follow its progress on the bracket.',
  emptyNoResult:
    'No confirmed results yet: the standings will fill in after the first matches.',
  groupLabel: 'Group {key}',
  colRank: '#',
  colTeam: 'Team',
  colPlayed: 'P',
  colPlayedTitle: 'Matches played',
  colWins: 'W',
  colWinsTitle: 'Wins',
  colLosses: 'L',
  colLossesTitle: 'Losses',
  colDraws: 'D',
  colDrawsTitle: 'Draws',
  colMaps: 'Maps',
  colMapsTitle: 'Maps won – lost',
  colDiff: '+/-',
  colDiffTitle: 'Map differential',
  colForm: 'Form',
  colFormTitle: 'Last {count} results, oldest to most recent',
  colPoints: 'Pts',
  colPointsTitle: 'Points',
  formW: 'Win',
  formL: 'Loss',
  formD: 'Draw',
  formWShort: 'W',
  formLShort: 'L',
  formDShort: 'D',
  tiebrokenBy: 'Tie broken by: {criterion}',
  tbHeadToHead: 'head-to-head',
  tbScoreDiff: 'map differential',
  tbWins: 'number of wins',
  tbScored: 'maps won',
  tbSeed: 'seeding',
  legend:
    'P: played · W: wins · L: losses · +/-: map differential · Pts: points. An asterisk marks a points tie that was broken; hover it for the criterion.',
  seeMatches: 'See all matches',
};
