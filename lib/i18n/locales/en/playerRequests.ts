// lib/i18n/locales/en/playerRequests.ts
//
// Traductions ANGLAISES du namespace `playerRequests`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerRequests.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  connectionError: 'Connection error.',
  errSelectTargetTeam: 'Select a target team.',
  errSelectPlayer: 'Select a player to transfer.',
  errSelectOpponent: 'Select an opposing team.',
  errCreateRequest: 'Unable to create the request.',
  errGeneric: 'Something went wrong.',
  fallbackPlayer: 'the player',
  fallbackTeam: 'the team',
  successProposeTransfer:
    'The transfer proposal for {playerName} to "{teamName}" has been sent.',
  successSelfTransfer:
    'Your transfer request to "{teamName}" has been sent. The target team\'s captain will review it.',
  successScrim: 'Your scrim request against "{teamName}" has been sent.',
  successTitleTab: "Request sent | OW Women's Cup",
  successHeading: 'Request sent',
  backToSpace: 'Back to my space',
  pageTitleTab: "Requests | OW Women's Cup",
  heading: 'Requests',
  intro: 'Request a transfer to another team or propose a scrim.',
  tabTransfer: 'Transfer',
  tabScrim: 'Scrim',
  noTeamTitle: 'No team',
  noTeamTransfer: 'You must be a member of a team to request a transfer.',
  noTeamScrim: 'You must be a member of a team to propose a scrim.',
  joinTeam: 'Join a team',
  proposeTransferMode: 'Propose a transfer',
  selfTransferMode: 'My transfer',
  captainTitle: 'Captain',
  captainBlocked:
    'As a captain, you must first transfer the captain role before requesting your own transfer.',
  playerToTransfer: 'Player to transfer',
  noPlayersInTeam: 'No players in your team',
  targetTeam: 'Target team',
  opponentTeam: 'Opposing team',
  searchTeam: 'Search for a team...',
  emptyJoinable: 'No team open for recruitment',
  emptyTeams: 'No team found',
  desiredRole: 'Desired role',
  rolePlayer: 'Player',
  roleSubstitute: 'Substitute',
  roleCoach: 'Coach',
  fallbackPlayerName: 'Player',
  msgToTargetCaptain: 'Message to the target captain (optional)',
  msgToCaptain: 'Message to the captain (optional)',
  msgToOpponent: 'Message to the opposing team (optional)',
  msgScrimPlaceholder: 'Suggest a time slot, a format, maps...',
  submitProposeTransfer: 'Propose the transfer',
  submitSelfTransfer: 'Send the transfer request',
  submitScrim: 'Send the scrim request',
  captainOrManagerTitle: 'Captain or manager required',
  captainOrManagerBody:
    'Only the captain or a manager of the team can send a scrim request.',
  dateLabel: 'Preferred date (optional)',
  loading: 'Loading...',
  sending: 'Sending...',
  defaultMsgPlaceholder: 'A message to go with your request...',
  membersCount: '{count}/5 members',
  slotsLabel: 'Proposed slots',
  addSlot: 'Add a slot',
  removeSlot: 'Remove this slot',
  maxSlotsHint:
    'Propose up to 5 slots. Your opponent will pick one or counter with others.',
  scrimTzNote: 'Slots in your timezone: {tz}',
  slotPrevWeek: 'Previous week',
  slotNextWeek: 'Next week',
  slotWeekOf: 'Week of {date}',
  slotMaxReached: '{max} slots maximum.',
  slotEmpty: 'No slot selected — click in the calendar.',
  atLeastOneSlot: 'Propose at least one slot.',
  tabsAria: 'Request type',
  transferModeAria: 'Transfer mode',
  roleGroupAria: 'Desired role',
};
