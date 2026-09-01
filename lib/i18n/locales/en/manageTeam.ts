// lib/i18n/locales/en/manageTeam.ts
//
// Traductions ANGLAISES du namespace `manageTeam`.
//
// La SOURCE DE VERITE est le francais (`../fr/manageTeam.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  loadError: 'Failed to load.',
  recruitmentOpen: 'Recruitment open',
  recruitmentClosed: 'Recruitment closed',
  memberRemoved: 'Member removed',
  roleUpdated: 'Role updated',
  playerAccepted: 'Player accepted',
  requestRejected: 'Request rejected',
  accessDeniedTitle: 'Access denied',
  accessDeniedBody:
    'You must be a captain or manager of a team to access this page.',
  backToSpace: 'Back to my space',
  tabTitle: "Manage {name} | OW Women's Cup",
  tabTitleMember: "{name} | OW Women's Cup",
  publicPage: 'Public page →',
  recruitment: 'Recruitment',
  recruitmentOpenDesc: 'Your team is open to player requests.',
  recruitmentClosedDesc: 'Your team is closed to recruitment.',
  roster_one: 'Roster ({count} member)',
  roster_other: 'Roster ({count} members)',
  copyBattleTag: 'Copy BattleTag',
  unknown: 'Unknown',
  staffTitle: 'Team staff ({count})',
  captain: 'Captain',
  optionPlayer: 'Player',
  optionSubstitute: 'Substitute',
  optionCoach: 'Coach',
  removeTitle: 'Remove',
  pendingRequests: 'Pending requests',
  pendingRequestsHelp:
    'Players asking to join your team. People YOU invited appear above, under "Sent invitations".',
  noPendingRequests: 'No pending request.',

  sentInvitations: 'Sent invitations',
  sentInvitationsHelp:
    'Awaiting a reply. A player joins the roster when she accepts her invitation — not before.',
  noSentInvitations: 'No pending invitation.',
  invitationsError: 'Could not load pending invitations.',
  invitedAs: 'Invited as ',
  invitedAsCaptain: 'captain',
  invitationSentOn: 'Sent on {date}',
  invitationExpiresOn: 'expires on {date}',
  invitationExpired: 'Expired',
  invitationNoEmail: 'No email — share the link manually',
  resendInvitation: 'Resend',
  resendInvitationTitle:
    'Send the invitation email again with a new link (the old one stops working)',
  resendInvitationDone: 'Invitation resent',
  resendInvitationDoneNoEmail:
    'Invitation resent, but the email did not go out — copy the link and share it.',
  resendInvitationError: 'Could not resend the invitation.',
  cancelInvitation: 'Cancel',
  cancelInvitationConfirm: "Cancel {name}'s invitation?",
  cancelInvitationDone: 'Invitation cancelled',
  cancelInvitationError: 'Could not cancel the invitation.',
  copyInviteLink: 'Copy link',
  defaultPlayerName: 'Player',
  wantsToJoinAs: 'Wants to join as ',
  accept: 'Accept',
  reject: 'Decline',
  removeConfirm: 'Remove {name} from the team?',
  confirmRemove: 'Confirm',
  cancelRemove: 'Cancel',
  promote: 'Make captain',
  promoteConfirm: 'Make {name} captain?',
  promoteConfirmYes: 'Confirm',
  promoteCancel: 'Cancel',
  promoteSuccess: '{name} is now the captain.',
  promoteError: 'Could not transfer captaincy.',
  designate: 'Make captain',
  designateConfirm: 'Make {name} the captain?',
  designateDialogSubtitle:
    'The team has no captain yet. Once designated, only she will be able to hand over the captaincy.',
  noCaptainTitle: 'This team has no captain yet',
  noCaptainBody:
    'Designate a player from the roster as captain, or wait for the invited captain to accept her invitation.',
  noCaptainBodyEmpty:
    'As soon as a player accepts her invitation, you will be able to make her captain.',
  specialtyLabel: 'In-game role',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  specialtyNone: 'Not specified',
  specialtyError: 'Could not update the in-game role.',
  onboardingTitle: 'Invite your first player',
  onboardingBody:
    "Your roster is empty for now. Open recruitment and share your team's public page to start receiving requests.",
  onboardingCta: 'View team page',
  removeConsequences:
    'Consequences: loss of tournament eligibility and related messages.',
  scrimOpenLabel: 'Open for scrims',
  scrimOpenHelp:
    'Your team is shown publicly on /scrim and can receive scrim proposals.',
  scrimOpenOn: 'Your team is now visible on the public scrims page',
  scrimOpenOff: 'Your team is now hidden from the public scrims page',
  verifiedBadge: 'verified',
  unverifiedBadge: 'unverified',
  joinMissingBattleTagLabel: "Player's BattleTag",
  joinMissingBattleTagHint:
    'She has not filled it in: enter it to add her to the roster, or ask her to complete her profile.',
  battleTagLabel: 'BattleTag',
  battleTagUpdated: 'BattleTag updated',
  battleTagError: 'Could not update the BattleTag.',
  battleTagInvalid: 'Invalid BattleTag format (e.g. Name#1234).',
  battleTagRequiredForRole:
    'A player must have a BattleTag — only team staff can leave it empty.',
  skillRatingUpdated: 'Rating updated',
  skillRatingError: 'Could not update the rating.',
  verifiedBadgeTitle: 'BattleTag verified via Battle.net',
  discordUnlinkedBadge: 'Discord not linked',
  discordUnlinkedBadgeTitle:
    'This person has not linked their Discord account: the bot cannot grant their roles, add them to the team channels, or call them up.',
  discordGapTitle_one:
    '{count} member out of {total} has not linked their Discord account',
  discordGapTitle_other:
    '{count} members out of {total} have not linked their Discord account',
  discordLeftBadge: 'Left the Discord',
  discordLeftBadgeTitle:
    'The account is linked, but this person is no longer on the Discord server: the bot can no longer grant their roles or call them up.',
  discordLeftTitle_one:
    '{count} member out of {total} has left the Discord server',
  discordLeftTitle_other:
    '{count} members out of {total} have left the Discord server',
  discordCheckedAt:
    'Last checked by the bot: {date} — it re-checks every 30 minutes.',
  discordLeftBody:
    'Their account is linked — it is the server they left. They cannot fix this from their player space: they need a new invite to the Discord.',
  discordGapBodyBoth:
    'Two different gaps: linking an account happens in the player space, coming back to the server needs a fresh invite. Either way the person gets no role, no team channel and no call-up — and cannot be validated.',
  discordGapBody:
    'Spot them by the orange badge below. Until the account is linked, the person gets no role, no team channel and no call-up — and cannot be validated. They do it themselves from their player space, once and for all.',
  unverifiedBadgeTitle:
    'BattleTag unverified — the player must link their Battle.net account',
  roleManager: 'Manager',
  specialtyUpdated: 'In-game role updated',
  roleLockedPrivileged:
    'Only the captain can change the role of a member who holds management rights — two managers must not be able to remove each other.',
  roleSelectLabel: 'Role in the team',
  errorTitle: "Couldn't load the team",
  errorBody: 'A network error occurred. Check your connection and try again.',
  retry: 'Retry',
  promoteDialogSubtitle:
    'Transferring captaincy is irreversible: you will lose your captain rights.',
  inviteTitle: 'Invite someone to the team',
  inviteHelp:
    'Send an invitation by email — or copy the private link and share it yourself (Discord, SMS…). They only join once they accept.',
  inviteEmailLabel: 'Email',
  inviteEmailPlaceholder: 'person@email.tld',
  inviteRoleLabel: 'Proposed role',
  inviteCta: 'Invite',
  invitePending: 'Sending…',
  inviteCreated: 'Invitation created.',
  inviteSentEmail: 'Invitation sent by email.',
  inviteEmailFailed: 'Invitation created — the email could not be sent.',
  inviteLinkHint:
    'Private link to share (valid 7 days, usable by one person only):',
  inviteCopyLink: 'Copy link',
  inviteError: 'The invitation could not be created.',

  scopeTitle: 'What your role lets you do',
  scopeIntro:
    'Your team role ({role}) unlocks the actions below. Everything else is reserved for the captain or a manager — that is why some sections are missing.',
  scopeNone:
    'Your role does not unlock any management action right now. Ask your captain to widen it if you need to.',
  permManageRoster: 'Manage the roster',
  permManageTeamInfo: 'Edit team info',
  permManageScrims: 'Manage scrims',
  permManageJoinRequests: 'Handle join requests',
  permRegisterTournaments: 'Register for tournaments',
  permSendCaptainMessages: 'Send team messages',
  permEditPublicPage: 'Customise the public page',
  permValidateLineup: 'Validate the lineup',

  delegateTitle: 'Delegated rights',
  delegateHelp:
    'You can hand one specific responsibility to a teammate without changing their role. You can only delegate what you have yourself, and a delegation never removes a right granted by the role.',
  delegateOpen: 'Rights',
  delegateClose: 'Close',
  delegateFromRole: 'from their role',
  delegateGranted: 'delegated',
  delegateNone: 'No specific rights.',
  delegateSaved: 'Rights updated.',
  delegateError: 'Updating the rights failed.',
  delegateLoadError: 'Rights could not be loaded.',
};
