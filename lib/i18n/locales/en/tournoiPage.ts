// lib/i18n/locales/en/tournoiPage.ts
//
// Traductions ANGLAISES du namespace `tournoiPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournoiPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'Tournament',
  heroTitle: 'Round Robin & Final',
  heroSubtitle:
    '4 teams, 6 group matches in BO3, then a grand final in BO5 to crown the champion.',
  teamPlaceholder: 'Team {number}',
  teamsTab: 'Teams',
  teamsHeading: 'Teams ready to compete',
  teamsSubtitle: 'All levels and several nationalities.',
  standingsHeading: 'Standings (Round Robin)',
  colTeam: 'Team',
  colMJ: 'MP',
  colMJTitle: 'Matches played',
  colV: 'W',
  colVTitle: 'Wins',
  colD: 'L',
  colDTitle: 'Losses',
  colMaps: 'Maps',
  colMapsTitle: 'Maps won-lost',
  colDiff: 'Diff',
  colDiffTitle: 'Map difference',
  tiebreakers: 'Tiebreakers: Wins > Map difference > Maps won.',
  scheduleHeading: 'Schedule – Group stage (BO3)',
  finalHeading: 'Final (BO5)',
  finalWaiting: 'Waiting for the 6 group results…',
  finalBo5Label: 'BO5 – First to 3',
  championLabel: '🏆 2025 Champion: {champion} 🏆',
  replaysEyebrow: 'Replays',
  replaysHeading: 'Relive the 2025 edition',
  replaysSubtitle: 'Finals, best moments and official VODs of the season.',
  replaysEmpty: 'No replay is available at the moment.',
  replayPlaceholder: 'Replace the YouTube ID to display the video.',
};
