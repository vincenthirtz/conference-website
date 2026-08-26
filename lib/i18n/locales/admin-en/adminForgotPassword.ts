// lib/i18n/locales/admin-en/adminForgotPassword.ts
//
// Traductions ANGLAISES du namespace admin `adminForgotPassword`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminForgotPassword.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: "Reset password | OW Women's Cup",
  badgeStaff: 'Staff',
  badgeAction: 'Reset',
  heading: 'Forgot password',
  intro: "Enter your staff email. We'll send you a link to set a new password.",
  emailLabel: 'Email',
  emailPlaceholder: 'first.last@organization.tld',
  submitSending: 'Sending...',
  submit: 'Send link',
  backToLogin: 'Back to login',
  errorEmailRequired: 'Please enter your email.',
  errorSendFailed: "Couldn't send the reset email.",
  successSent:
    'If an account exists with this email, a reset link has been sent.',
  errorUnexpected: 'Unexpected error',
};
