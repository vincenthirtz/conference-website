// lib/i18n/locales/en/checkin.ts
//
// Traductions ANGLAISES du namespace `checkin`.
//
// La SOURCE DE VERITE est le francais (`../fr/checkin.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  loadError: 'Failed to load your match.',
  submitFailed: 'Check-in failed.',
  submitNetwork: 'Network error during check-in.',
  backToMatches: 'My matches',
  title: 'Check-in',
  subtitle: 'Confirm your presence before kickoff.',
  signinPrompt: 'Sign in to confirm your check-in.',
  signin: 'Sign in',
  sessionExpired: 'Your session expired. Sign in again to check in.',
  signinAgain: 'Sign in again',
  noMatchTitle: 'No match to confirm right now',
  noMatchBody: 'Check-in opens shortly before your next match kicks off.',
  seeMatches: 'View my matches',
  opponentTbd: 'Opponent TBD',
  dateToCome: 'Date TBD',
  noWindow: 'No check-in window for this match.',
  checkedInTitle: 'Check-in confirmed',
  confirmed: 'Your presence is confirmed.',
  validatedAt: 'Confirmed at {time} (Paris time).',
  openTitle: 'Check-in is open',
  openBody: 'Confirm your presence now.',
  closesIn: 'Window closes in',
  submitting: 'Confirming…',
  submit: 'Confirm check-in',
  notOpenTitle: 'Check-in is not open yet',
  opensAtPrefix: 'It will open at',
  opensAtSuffix: '(Paris time).',
  opensIn: 'Opens in',
  passedTitle: 'The check-in window is closed',
  passedBody:
    "You didn't confirm your check-in in time. If this is a mistake, let staff know: the ticket opens with the match details already filled in.",
  contactStaff: 'Open a ticket with staff',
  // Pre-filled support ticket (check-in window passed).
  supportSubject: 'Missed check-in — {team} vs {opponent}',
  supportMessage:
    "Hello, our team {team} couldn't confirm its check-in for the match against {opponent} ({tournament}), scheduled {date}.\nMatch ID: {matchId}\n\nWhat happened: ",
  unavailable: 'Check-in is not available for this match.',
  restrictedOpenTitle: 'Check-in open',
  restrictedBody: 'Check-in is done by the captain, the coach or the manager.',
  successToast: "Attendance confirmed! You're checked in for this match.",
  alreadyToast: 'You were already checked in for this match.',
  confirmedHeading: 'Attendance confirmed ✓',
  openMatchThread: 'See the full run of this match →',
};
