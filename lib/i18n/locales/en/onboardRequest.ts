// lib/i18n/locales/en/onboardRequest.ts
//
// Traductions ANGLAISES du namespace `onboardRequest`.
//
// La SOURCE DE VERITE est le francais (`../fr/onboardRequest.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  slugRequired: 'The slug is required.',
  slugFormat:
    '3 to 30 characters, starts with a letter, then letters/digits/hyphens.',
  slugReserved: 'This slug is reserved.',
  loading: 'Loading…',
  signInTitle: 'Sign-in required',
  signInBody:
    'To request the bot, we need your Discord ID. Sign in to start the form.',
  noPassword: 'No password to create.',
  backToIntro: 'Back to the presentation',
  linkTitle: 'Link your Discord account',
  linkBodyConnected: 'You are signed in',
  linkBodyRest:
    'but your Discord identity is not linked to this account. To request the bot, you must first link your Discord.',
  linkCtaLabel: 'Link my Discord account',
  linkRedirectNote:
    'You will be redirected to Discord to authorize the link, then brought back here to fill in the form.',
  slugAvailable: 'Slug available — will be your URL.',
  step1Badge: 'Step 1/3',
  step1Sub: 'Bot request',
  formTitle: 'Describe your organization',
  formSubtitle:
    'All the info can be edited later from the admin. We send you a confirmation email after submission.',
  slugLabel: 'Slug (URL)',
  slugHintBefore: 'Will appear in your URLs (',
  slugHintAfter: '). 3 to 30 characters, starts with a letter. Reserved words:',
  slugFallback: 'your-slug',
  orgNameLabel: 'Organization name',
  orgNamePlaceholder: 'e.g. Esport Club FR',
  emailLabel: 'Contact email',
  emailPlaceholder: 'contact@your-domain.tld',
  emailHint:
    'The confirmation link is sent here. Use an address you actually check.',
  descriptionLabel: 'Description',
  optional: '(optional)',
  descriptionPlaceholder:
    'A few words about your organization, your usual tournaments, your community…',
  captchaMissing:
    'Captcha not configured (NEXT_PUBLIC_TURNSTILE_SITE_KEY). Submission allowed in dev — the server check will block it anyway in production.',
  submitting: 'Sending…',
  submit: 'Send my request',
  consentNote:
    'By submitting this form you agree to receive a confirmation email at the address provided.',
  backToIntroArrow: '← Back to the presentation',
  errorSlugInvalid: 'Invalid slug: {reason}',
  errorOrgRequired: 'The organization name is required.',
  errorDescTooLong: 'The description cannot exceed 1000 characters.',
  errorCaptcha: 'Please complete the captcha before sending.',
  errorSession: 'Session expired — sign in again via Discord and retry.',
  errorRateLimit: 'Too many attempts. Try again in a few minutes.',
  errorConflict:
    'An active request already exists — check your emails or contact staff.',
  errorBadData: 'Invalid data.',
  errorGeneric: 'Unable to submit the request at the moment.',
  toastSuccess: 'Request sent. Check your emails to confirm.',
  errorNetwork: 'Network or server error. Try again in a moment.',
  prefillPlan: 'Plan of interest: {plan}.',
};
