// lib/i18n/locales/en/loginPage.ts
//
// Traductions ANGLAISES du namespace `loginPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/loginPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: "Sign in | OW Women's Cup",
  title: 'Sign in',
  subtitle: 'Sign in to access your player space or the admin panel.',
  checkingSession: 'Checking session...',
  emailLabel: 'Email',
  emailPlaceholder: 'first.last@organisation.tld',
  passwordLabel: 'Password',
  rememberMe: 'Remember me',
  forgotPassword: 'Forgot password?',
  submit: 'Sign in',
  submitting: 'Signing in…',
  continueWithDiscord: 'Continue with Discord',
  noAccount: 'No account yet?',
  createAccount: 'Create my account',
  backToPublic: '← Back to public site',
  errorInvalidCredentials: 'Incorrect email or password.',
  errorNoSession: 'Unable to retrieve the session.',
  errorUserNotFound: 'User not found after signing in.',
  errorGeneric:
    'Something went wrong while signing in. Please try again in a moment.',
  errorDiscordUnavailable: 'Discord sign-in is unavailable right now.',
  errorDiscordGeneric:
    'Something went wrong with Discord. Please try again in a moment.',
  continueWithBattlenet: 'Continue with Battle.net',
  battlenetLinkedOnly:
    'Battle.net only works if you have already linked your Blizzard account from your profile.',
  battlenetNotLinked:
    "This Battle.net account isn't linked to any OW Women's Cup account. Sign in with email or Discord, then link your Blizzard account from your profile — this button will work afterwards.",
  battlenetError: 'Battle.net sign-in failed, try again or use your email.',
};
