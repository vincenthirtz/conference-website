// lib/i18n/locales/en/playerMatches.ts
//
// Traductions ANGLAISES du namespace `playerMatches`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerMatches.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  loadError: 'Failed to load your matches.',
  dateToCome: 'Date TBD',
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
  live: 'Live',
  opponentTbd: 'Opponent TBD',
  viewMatch: 'View match',
  liveCast: 'Live cast',
  checkedIn: 'Checked in',
  checkin: 'Check-in',
  title: 'My matches',
  backToDashboard: 'Dashboard',
  signinPrompt: "Sign in to see your team's matches.",
  signin: 'Sign in',
  teamSchedule: 'Schedule and results for {team}.',
  yourSchedule: 'Your match schedule.',
  noTeamTitle: "You're not on a team yet",
  noTeamBody: 'Join or create a team to see your matches here.',
  goToDashboard: 'Go to dashboard',
  noMatchTitle: 'No match scheduled',
  noMatchBody: 'Your upcoming matches will appear here once they are planned.',
  upcoming: 'Upcoming',
  results: 'Results',
  reportScore: 'Report score',
  reportScoreTitle: 'Report score',
  reportScoreIntro: 'Enter the number of maps won by each team.',
  myTeamScore: 'Maps won by my team',
  opponentScore: 'Maps won by the opponent',
  myTeamLabel: 'My team',
  opponentLabel: 'Opponent',
  bestOfHint: 'Format: BO{bestOf}',
  submitReport: 'Send score',
  updateReport: 'Update score',
  cancel: 'Cancel',
  submitting: 'Sending…',
  currentReportLabel: 'Your current report',
  editReport: 'Edit my report',
  statusAwaiting: "Score sent. Waiting for the opponent's confirmation.",
  statusAwaitingShort: 'Waiting for opponent',
  statusFinalized: 'Match confirmed!',
  statusDisputed: 'Score disagreement: a staff member will resolve it.',
  statusDisputedShort: 'Disputed',
  badgeAwaiting: 'Score pending',
  badgeDisputed: 'Score disputed',
  errInvalidScore: 'Invalid score. Check the values you entered.',
  errNotCaptain: 'Only a team captain can report the score.',
  errFinalized: 'This match is already finalized. Contact staff to change it.',
  errRateLimited: 'Too many attempts. Try again in a moment.',
  errGeneric: 'Failed to send the score. Please try again.',
  retry: 'Retry',
};
