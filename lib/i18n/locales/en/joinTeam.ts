// lib/i18n/locales/en/joinTeam.ts
//
// Traductions ANGLAISES du namespace `joinTeam`.
//
// La SOURCE DE VERITE est le francais (`../fr/joinTeam.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  connectionError: 'Connection error.',
  selectTeamError: 'Select a team to join.',
  createRequestError: 'Unable to create the request.',
  genericError: 'An error occurred.',
  selectedTeamFallback: 'the selected team',
  successTitle: 'Request sent',
  successTabTitle: "Request sent | OW Women's Cup",
  successBody:
    'Your request to join "{name}" has been sent. The team captain will review it soon.',
  backToSpace: 'Back to my space',
  pageTabTitle: "Join a team | OW Women's Cup",
  pageTitle: 'Join a team',
  pageIntro:
    'Search and select the team you want to join. The team captain will review your request.',
  searchLabel: 'Search for a team',
  searchPlaceholder: 'Search by name...',
  allCountries: 'All countries',
  slotsOnly: 'Open slots only',
  loading: 'Loading...',
  emptyTitle: 'No team is recruiting right now.',
  emptySubtitle: 'Come back later, or create your own to start your roster.',
  createMyTeam: 'Create my team →',
  membersSuffix: 'members',
  desiredRoleLabel: 'Desired role',
  rolePlayer: 'Player',
  roleSub: 'Substitute (sub)',
  messageLabel: 'Message to the captain (optional)',
  messagePlaceholder: 'Introduce yourself briefly to the captain...',
  submitting: 'Sending...',
  submit: 'Send my request',
  ctaQuestion: 'Want to create your own team?',
  becomeCaptain: 'Become a captain',
  alreadyInTeamTitle: 'You are already on a team',
  alreadyInTeamBody:
    'You are already a member of "{teamName}". To switch teams, use Requests › Transfer.',
  alreadyInTeamCta: 'Go to my transfer requests →',
  battleTagLabel: 'Your BattleTag',
  battleTagPlaceholder: 'Name#1234',
  battleTagHint:
    'Blizzard format: name, hash, four digits. It will show on your team roster.',
  battleTagInvalid: 'Invalid BattleTag format (e.g. Name#1234).',
  battleTagRequired: 'We need your BattleTag to add you to a roster.',
  teamsLoadError: 'Unable to load teams. Please try again.',
  retry: 'Retry',
};
