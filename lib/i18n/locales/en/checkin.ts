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
    "You didn't confirm your check-in in time. Contact staff if this is a mistake.",
  contactStaff: 'Contact staff',
  unavailable: 'Check-in is not available for this match.',
  successToast: "Attendance confirmed! You're checked in for this match.",
  alreadyToast: 'You were already checked in for this match.',
  confirmedHeading: 'Attendance confirmed ✓',
};
