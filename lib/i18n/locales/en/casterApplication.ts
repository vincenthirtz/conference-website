// lib/i18n/locales/en/casterApplication.ts
//
// Traductions ANGLAISES du namespace `casterApplication`.
//
// La SOURCE DE VERITE est le francais (`../fr/casterApplication.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  motivationTooLong: 'Motivation cannot exceed {max} characters.',
  invalidUrl: 'The link must be a valid URL (https://...).',
  alreadyStaff: 'You are already part of the staff.',
  alreadyPending: 'You already have an application under review.',
  alreadyExists: 'Application already exists.',
  sendFailed: 'Unable to send your application.',
  applicationSent: 'Your casting application has been sent!',
  genericError: 'An error occurred.',
  headTitle: "Join the cast | OW Women's Cup",
  backToSpace: 'Back to my space',
  pageTitle: 'Join the cast',
  intro:
    'Want to cast our matches live? Tell us about your motivation and share a link to your casts or your Twitch channel. The casting team will review your application.',
  canResubmit: 'You can submit a new application below.',
  motivationLabel: 'Motivation (optional)',
  motivationPlaceholder:
    'Tell us about your experience, your style, why you want to cast...',
  portfolioLabel: 'Portfolio / Twitch link (optional)',
  portfolioPlaceholder: 'https://twitch.tv/your-channel',
  sending: 'Sending...',
  resubmit: 'Resubmit my application',
  submit: 'Send my application',
  footer:
    'Casting is open to everyone: no pro experience needed, just motivation and availability during our stream slots.',
  pendingTitle: 'Application under review',
  pendingText:
    'Your casting application was sent on {date}. The casting team will get back to you soon.',
  approvedTitle: 'Welcome to the cast! 🎉',
  approvedText:
    "Your application has been accepted. You are now part of the OW Women's Cup casting team.",
  rejectedTitle: 'Application not selected',
  rejectedText:
    'Your previous application was not selected. You can resubmit an application whenever you like.',
  loadError: 'Unable to load your application. Please try again.',
  retry: 'Retry',
};
