// lib/i18n/locales/admin-en/adminEmailLogs.ts
//
// Traductions ANGLAISES du namespace admin `adminEmailLogs`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminEmailLogs.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Email logs (Brevo)',
  viewMessages: 'Messages',
  viewEvents: 'Events',
  viewToggleAria: 'Choose view: messages or events',
  messagesCount: '{count} distinct email(s)',
  eventRequests: 'Sent',
  eventDelivered: 'Delivered',
  eventOpened: 'Opened',
  eventClicks: 'Clicked',
  eventSoftBounces: 'Soft bounce',
  eventHardBounces: 'Hard bounce',
  eventSpam: 'Spam',
  eventBlocked: 'Blocked',
  eventInvalid: 'Invalid',
  eventDeferred: 'Deferred',
  backToDashboard: 'Back to admin dashboard',
  heading: 'Email logs',
  subtitle: 'History of transactional emails via Brevo',
  quota: '300 emails/day (free)',
  retry: 'Retry',
  testHeading: 'Send a test email',
  testPlaceholder: 'recipient@example.com',
  testSend: 'Send',
  toastTestSent: 'Email sent ({id})',
  testFailed: 'Failed',
  errorNetwork: 'Network error',
  labelEmail: 'Email',
  placeholderEmail: 'recipient@...',
  labelStatus: 'Status',
  statusAll: 'All',
  labelFrom: 'From',
  labelTo: 'To',
  filter: 'Filter',
  empty: 'No emails found for these filters',
  from: 'From: {from}',
  idLabel: 'ID: {id}…',
  previous: 'Previous',
  next: 'Next',
  errorUnexpected: 'Unexpected error',
};
