// lib/i18n/locales/en/playerNotifications.ts
//
// Traductions ANGLAISES du namespace `playerNotifications`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerNotifications.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eventLabels: {
    'match.starting': 'Match starting soon',
    'match.finished': 'Match finished',
    'match.score_reported': 'Score reported',
    'checkin.opened': 'Check-in opened',
    'scrim.invitation': 'Scrim invitation',
    'scrim.confirmed': 'Scrim confirmed',
    'team.forfeit': 'Team forfeit',
    'news.published': 'New article',
    'team.weekly.recap': 'Weekly team recap',
  },
  eventDescriptions: {
    'match.starting': 'When one of your matches is about to start.',
    'match.finished': 'When one of your matches ends.',
    'match.score_reported': 'When a score is reported on one of your matches.',
    'checkin.opened': 'When the check-in window opens.',
    'scrim.invitation': 'When your team receives a scrim invitation.',
    'scrim.confirmed': 'When a scrim is confirmed.',
    'team.forfeit': 'When a forfeit involves your team.',
    'news.published': 'When an article is published.',
    'team.weekly.recap':
      "Your team's week in review. Only sent when something actually happened.",
  },
  loadError: 'Error while loading your notifications.',
  prefSaved: 'Preference saved.',
  prefSaveError: 'Unable to save the preference.',
  pageTitle: 'Notifications',
  signedOutIntro: 'Sign in to manage your notifications.',
  signIn: 'Sign in',
  unreadMessages: 'Unread messages',
  unreadMessagesDesc: 'Captain conversations',
  pendingScrims: 'Scrim requests',
  pendingScrimsDesc: 'To handle on the dashboard',
  joinRequests: 'Join requests',
  joinRequestsDesc: 'Join your team',
  checkinPending: 'Check-in to confirm',
  checkinPendingDesc: 'Confirm your attendance',
  backToDashboard: 'Dashboard',
  intro: 'Your pending actions and your push notification preferences.',
  pendingHeading: 'Pending',
  allUpToDate: 'All caught up ✓',
  noPending: 'You have no pending actions.',
  prefsHeading: 'Notification preferences',
  prefsFootnote:
    'These settings apply to browser push notifications. Enable notifications above first to receive them.',
  broadcastTitle: 'Announcements & campaigns',
  broadcastDesc:
    "Announcement and news emails from the OW Women's Cup. Your match notifications are not affected.",
  broadcastAriaLabel: 'Receive announcement & campaign emails',
  invitesTitle: 'Received invitations',
  invitesIntro: 'Some teams have invited you to join them.',
  inviteRole: 'Proposed role: {role}',
  inviteRoleWithSpecialty: 'Proposed role: {role} ({specialty})',
  inviteExpires: 'Expires on {date}',
  inviteNoExpiry: 'No expiry date',
  acceptInvite: 'Join the team',
  declineInvite: 'Decline',
  inviteAccepted: 'You joined the team {team} 🎉',
  inviteDeclined: 'Invitation declined.',
  alreadyInTeam: 'You are already on a team. Leave it before joining another.',
  inviteExpired: 'This invitation has expired.',
  inviteNotFound: 'Invitation not found.',
  inviteForbidden: 'This invitation is not addressed to you.',
  inviteError: 'Something went wrong. Please try again later.',
  inviteRolePlayer: 'Player',
  inviteRoleSubstitute: 'Substitute',
  inviteRoleCoach: 'Coach',
  inviteRoleManager: 'Manager',
  inviteConfirmTitle: 'Join {team}?',
  inviteConfirmSubtitle:
    'You will join this team. If you are already in a team, you will leave it.',
  inviteConfirmYes: 'Join',
  inviteConfirmNo: 'Cancel',
  prefsChannelEvent: 'Event type',
  prefsChannelPush: 'Push',
  prefsChannelEmail: 'Email',
  prefsPushHint:
    'Push notifications are real-time, delivered straight to your browser.',
  prefsEmailOptInHint:
    'Emails are off by default (opt-in). They are sent as a digest about twice a day (not real-time), with an unsubscribe link in every message.',
  prefsChannelNotApplicable: 'Not available for this channel',
  extraEventLabels: {
    'match.scheduled': 'Match scheduled',
    'scrim.scheduled': 'Scrim scheduled',
  },
  extraEventDescriptions: {
    'match.scheduled': 'When one of your matches is added to the schedule.',
    'scrim.scheduled': 'When a scrim is scheduled with your team.',
  },
};
