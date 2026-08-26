// lib/i18n/locales/admin-en/adminNotifications.ts
//
// Traductions ANGLAISES du namespace admin `adminNotifications`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminNotifications.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Notifications',
  breadcrumbAdmin: 'Admin',
  breadcrumbNotifications: 'Notifications',
  kicker: 'PWA & Web Push',
  heading: 'Notifications',
  intro:
    'Configure the push notifications received on your admin devices (installed PWA or open browser). Preferences are shared across all your devices; the subscription below applies only to the current device.',
  pwaWarning:
    "The PWA is not enabled in this environment (NEXT_PUBLIC_ENABLE_PWA ≠ '1'). Subscriptions and tests will only work on master/prod.",
  deviceStatusHeading: "This device's status",
  deviceStatusSubtitle:
    'Browser permission and push subscription on this specific browser.',
  subscribing: 'Subscribing…',
  subscribe: 'Subscribe this device',
  unsubscribing: 'Unsubscribing…',
  unsubscribe: 'Unsubscribe this device',
  testSending: 'Sending…',
  sendTest: 'Send a test notification',
  deniedHelp:
    'Permission was denied. To re-enable, go to the site settings in your browser (padlock icon in the URL bar) and allow notifications, then refresh this page.',
  prefsHeading: 'Preferences by event type',
  prefsSubtitle:
    'Uncheck to stop receiving an event type (on all your devices).',
  savingPrefs: 'Saving…',
  savePrefs: 'Save',
  loadingPrefs: 'Loading preferences…',
  toggleAria: '{label} notifications',
  statusSubscribed: 'Enabled on this device',
  statusNoSub: 'Permission granted — not yet subscribed here',
  statusDefault: 'Not configured',
  statusDenied: 'Denied (browser settings)',
  statusUnsupported: 'Not supported ({reason})',
  errorLoadPrefs: 'Error while loading preferences.',
  prefsSaved: 'Preferences saved.',
  errorSave: 'Error while saving.',
  vapidMissing: 'Public VAPID key missing on the server side.',
  permissionDenied: 'Permission denied by the browser.',
  permissionNotGranted: 'Permission not granted.',
  deviceSubscribed: 'Device subscribed to notifications.',
  errorSubscribe: 'Error while subscribing.',
  noActiveSub: 'No active subscription on this device.',
  deviceUnsubscribed: 'Device unsubscribed.',
  errorUnsubscribe: 'Error while unsubscribing.',
  testFailed: 'Failed to send the test.',
  testResult: 'Test: {parts}.',
  testSent: '{count} sent',
  testExpired: '{count} expired purged',
  testFailedCount: '{count} failed',
  groupMatchesCast: 'Matches & Cast',
  groupMatchesCastDesc: 'Everything happening on stage or on the cast side.',
  groupScrims: 'Scrims',
  groupTournoi: 'Tournament',
  groupRegistrations: 'Registrations & Support',
  groupOthers: 'Other',
  evtMatchStartingLabel: 'Match imminent',
  evtMatchStartingHint: 'A few minutes before kickoff.',
  evtMatchFinishedLabel: 'Match finished',
  evtScoreReportedLabel: 'Score reported',
  evtScoreReportedHint: 'A captain just submitted a score.',
  evtCastAssignedLabel: 'Cast assigned',
  evtCastUnassignedLabel: 'Cast unassigned',
  evtScrimInvitationLabel: 'Scrim invitation',
  evtScrimConfirmedLabel: 'Scrim confirmed',
  evtTeamForfeitLabel: 'Team forfeit',
  evtCheckinOpenedLabel: 'Check-in opened',
  evtRegistrationNewLabel: 'New registration',
  evtHelloassoPaymentLabel: 'HelloAsso payment',
  evtCaptainSupportLabel: 'Captain ticket opened',
  evtNewsPublishedLabel: 'News published',
  evtStaffRoleChangedLabel: 'Staff role changed',
};
