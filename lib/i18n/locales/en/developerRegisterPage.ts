// lib/i18n/locales/en/developerRegisterPage.ts
//
// Traductions ANGLAISES du namespace `developerRegisterPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/developerRegisterPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badgeRole: 'Developer',
  badgeAction: 'Self-service account',
  title: 'Create a developer account',
  subtitle:
    'Self-service access to the public API: generate your keys, subscribe to webhooks and track your usage. Pay-as-you-go billing based on your usage.',
  orgNameLabel: 'Organization / project name',
  orgNamePlaceholder: 'My studio, my app…',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  passwordLabel: 'Password',
  passwordHint: '8 characters minimum.',
  submit: 'Create my account',
  submitLoading: 'Creating account…',
  captchaMissing:
    'Anti-bot verification unavailable (Turnstile key not configured). Please try again later.',
  errorPasswordTooShort: 'The password must be at least 8 characters.',
  errorOrgRequired: 'Enter the name of your organization or project.',
  errorEmailRequired: 'Enter an email address.',
  errorCaptcha: 'Please complete the anti-bot verification.',
  errorRateLimited:
    'Too many attempts. Please wait a moment before trying again.',
  errorGeneric: 'Account creation failed. Please try again in a moment.',
  errorNetwork: 'A network error occurred. Check your connection.',
  alreadyExists: 'An account already exists with this email.',
  signinFailed:
    'Your account was created successfully. Sign in with your email and password.',
  linkLogin: 'Sign in',
  linkBackToDocs: 'View the API documentation',
};
