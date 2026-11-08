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
    'team.join.decided': 'Answer to your application',
    'captain.message': 'Message from another team',
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
    'team.join.decided':
      'When a team accepts or declines your request to join it. The bot also sends you a Discord message, which this setting does not turn off.',
    'captain.message':
      'When a team writes to yours, if you can reply on its behalf. The content stays in your messages.',
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
  intro:
    'Your pending actions, your notification history and your preferences.',
  pendingHeading: 'Pending',
  allUpToDate: 'All caught up ✓',
  noPending: 'You have no pending actions.',
  teamHeading: 'Team notifications',
  teamEmpty: 'No notifications for your team in the last 30 days.',
  teamNew: 'New',
  teamLoadError: 'Could not load your team notifications.',
  teamKindLabels: {
    scrim_accepted: 'Scrim accepted',
    scrim_acknowledged: 'Scrim request acknowledged',
    rules_validation_requested: 'Rules to accept',
    rules_reminder: 'Reminder: rules to accept',
  },
  teamKindFallback: 'Team notification',
  teamText: {
    scrim_accepted: 'Scrim accepted against {opponent}.',
    scrim_accepted_dated:
      'Scrim accepted against {opponent}, scheduled for {date}.',
    scrim_acknowledged:
      'Your team’s scrim request against {opponent} has been acknowledged: the teams are organising it directly between themselves.',
    rules_validation_requested:
      'The rules of {tournament} are waiting for you: read them to the end, then accept them so that your team’s registration is complete.',
    rules_reminder:
      'A reminder from your team: the rules of {tournament} are still waiting for you. Your team’s registration stays incomplete until you accept them.',
  },
  teamRulesCta: 'Read the rules',
  historyHeading: 'History',
  historyIntro:
    'Everything we have sent you, read or not, even when push is turned off.',
  historyEmpty: 'No notifications yet. The ones we send you will show up here.',
  historyLoadError: 'Could not load your history.',
  historyMoreError: 'Could not load more. Please try again.',
  historyLoadMore: 'Show more',
  historyLoadingMore: 'Loading…',
  historyMarkAll: 'Mark all as read',
  historyUnreadLeft_one: '{count} older unread notification.',
  historyUnreadLeft_other: '{count} older unread notifications.',
  historyOpen: 'Open',
  historyTeam: 'Team {team}',
  historyGroups: {
    match: 'Match',
    team: 'Team',
    scrim: 'Scrim',
    rules: 'Rules',
    other: 'Other',
  },
  prefsHeading: 'Notification preferences',
  prefsChannelsTitle: 'What these settings change',
  prefsChannelsHistory:
    'History: it always receives everything, whatever the settings below.',
  prefsChannelsPush:
    'Push: the switches decide which browser alerts you get on this device. Enable notifications above first to receive them.',
  prefsChannelsEmail:
    'Email: the switches decide what goes into the digest sent about twice a day; “Announcements & campaigns” decides on announcement emails. The check-in email, sent an hour before the match to the captain, the coach and the manager, always goes out.',
  prefsChannelsDiscord:
    'Discord: messages from the bot (check-in reminders 30 and 15 minutes before the match, match sheet, scrim requests…) cannot be set here yet.',
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
  inviteAlreadyProcessed:
    'This invitation has already been handled (accepted, declined or withdrawn).',
  inviteRolePlayer: 'Player',
  inviteRoleSubstitute: 'Substitute',
  inviteRoleCoach: 'Coach',
  inviteRoleManager: 'Manager',
  inviteConfirmTitle: 'Join {team}?',
  inviteConfirmSubtitle:
    'You will join this team. You can only be on one team at a time: if you are already on another one, leave it first.',
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
