// lib/i18n/locales/en/newsletterSignup.ts
//
// Traductions ANGLAISES du namespace `newsletterSignup`.
//
// La SOURCE DE VERITE est le francais (`../fr/newsletterSignup.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  footerTitle: 'Newsletter',
  footerDescription:
    'Get highlights, tournament dates and announcements by email.',
  sectionTitle: 'Never miss an announcement',
  sectionDescription:
    "Subscribe to the newsletter to get tournament dates, highlights and OW Women's Cup news straight to your inbox.",
  emailLabel: 'Email address',
  emailPlaceholder: 'your@email.com',
  captchaLabel: 'Anti-bot — what is {question}?',
  captchaPlaceholder: 'Answer with a number',
  submit: 'Subscribe',
  submitting: 'Sending…',
  successTitle: 'Almost there!',
  successBody: 'Check your inbox to confirm your subscription.',
  errorEmail: 'Please enter a valid email address.',
  errorGeneric: 'Subscription failed. Please try again in a moment.',
  honeypotLabel: 'Do not fill in',
  privacyNote: 'One confirmation email only. Unsubscribe anytime.',
};
