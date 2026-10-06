// lib/i18n/locales/en/requestCaptain.ts
//
// Traductions ANGLAISES du namespace `requestCaptain`.
//
// La SOURCE DE VERITE est le francais (`../fr/requestCaptain.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  connectionError: 'Connection error.',
  errSelectTeam: 'Select a team.',
  errTeamNameRequired: 'The team name is required.',
  errTeamNameTooShort: 'The team name must be at least 2 characters.',
  errInvalidEmail: 'Invalid email: {email}',
  errMemberInvalid:
    'Fix the member errors before sending (BattleTag, email or duplicate).',
  errCreateRequest: 'Unable to create the request.',
  errGeneric: 'Something went wrong.',
  fallbackSelectedTeam: 'the selected team',
  successTitleTab: "Request sent | OW Women's Cup",
  successHeading: 'Request sent',
  successBody:
    'Your request to become captain of "{teamName}" has been sent. An admin will review it soon.',
  backToSpace: 'Back to my space',
  pageTitleTab: "Become a captain | OW Women's Cup",
  backLink: '← Back to my space',
  heading: 'Become a team captain',
  intro:
    'Choose an existing team or create a new one. An admin will review your request.',
  modeNew: 'Create a team',
  modeExisting: 'Existing team',
  messageLabel: 'Message (optional)',
  messagePlaceholder: 'Additional information for the admins...',
  submitting: 'Sending...',
  submit: 'Send my request',
  footerNote:
    'As a captain, you will be able to manage your team members and register for tournaments.',
  teamsLoadError: 'Unable to load teams. Please try again.',
  retry: 'Retry',
  searchLabel: 'Search for a team',
  searchPlaceholder: 'Search by name...',
  noTeams: 'No team found',
  pendingTitle: 'You already have a pending captain request',
  pendingBody:
    'Your request for "{teamName}", sent on {date}, is waiting for staff approval. One request at a time: cancel it to make another one.',
  pendingBodyNoDate:
    'Your request for "{teamName}" is waiting for staff approval. One request at a time: cancel it to make another one.',
  pendingTeamFallback: 'your team',
  pendingCancel: 'Cancel and pick another team',
  pendingCancelling: 'Cancelling…',
  pendingCancelError: 'Unable to cancel the request. Please try again.',
};
