// lib/i18n/locales/en/registerPage.ts
//
// Traductions ANGLAISES du namespace `registerPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/registerPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badgeRole: 'Staff / Player',
  badgeAction: 'Sign-up',
  title: 'Create an account',
  subtitle:
    "Sign up with your email. You'll get a link to confirm your account before signing in.",
  accountTypeLegend: "I'm creating this account as",
  accountTypePlayer: 'Player',
  accountTypePlayerHint: "I play on a team, or I'm looking for one.",
  accountTypeManager: 'Manager',
  accountTypeManagerHint: 'I run a team without playing on it.',
  managerNoBattleTagNote:
    "No BattleTag needed: as a manager you don't need an Overwatch account. Once your email is confirmed you'll be able to create your team — and to run more than one.",
  displayNameLabel: 'Display name (optional)',
  displayNamePlaceholder: 'e.g. LaKiiroi',
  battleTagLabel: 'BattleTag (format Name#0000)',
  battleTagPlaceholder: 'e.g. Gamerette#1234',
  emailLabel: 'Email',
  emailPlaceholder: 'first.last@email.tld',
  passwordLabel: 'Password',
  confirmLabel: 'Confirmation',
  submit: 'Create account',
  submitLoading: 'Creating...',
  continueWithDiscord: 'Continue with Discord',
  linkLogin: 'Sign in',
  linkBackToSite: 'Back to site',
  castBlurb:
    'Want to cast our matches? Create your account, then apply from your player space.',
  castLink: 'Join the cast',
  neutralSignupMsg:
    "If this address isn't already in use, a confirmation email has just been sent. Check your inbox, then sign in.",
  passwordTooShort: 'The password must be at least 8 characters.',
  passwordMismatch: "The passwords don't match.",
  battleTagInvalid: 'The BattleTag must follow the Name#0000 format.',
  rateLimited: 'Too many attempts. Please wait a moment before trying again.',
  createAccountError:
    'Unable to create the account right now. Please try again in a moment.',
  submitGenericError:
    'Something went wrong while creating the account. Please try again in a moment.',
  discordStartError: 'Unable to start Discord sign-up right now.',
  discordGenericError:
    'Something went wrong with Discord. Please try again in a moment.',
};
