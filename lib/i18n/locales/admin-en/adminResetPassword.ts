// lib/i18n/locales/admin-en/adminResetPassword.ts
//
// Traductions ANGLAISES du namespace admin `adminResetPassword`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminResetPassword.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: "New password | OW Women's Cup",
  badgeStaff: 'Staff',
  badgeAction: 'Reset',
  heading: 'New password',
  intro:
    'Enter your new password after opening the link you received by email.',
  loadingSession: 'Loading session…',
  invalidLinkDefault: 'Invalid, expired, or already-used link.',
  singleUseNote:
    'Reset links are single-use: only open them once. Request a new link below.',
  requestNewLink: 'Request a new link',
  newPasswordLabel: 'New password',
  confirmLabel: 'Confirmation',
  submitUpdating: 'Updating...',
  submit: 'Update',
  backToLogin: 'Back to login',
  errorCodeInvalid: 'Invalid or already-used recovery link.',
  errorRestoreSession: "Couldn't restore the recovery session.",
  errorNoSession:
    'Invalid, expired, or already-used link. Request a new reset link.',
  errorLinkExpiredSubmit:
    'Expired or already-used link. Request a new reset link.',
  errorPasswordTooShort: 'The password must be at least 8 characters.',
  errorPasswordMismatch: "The passwords don't match.",
  errorUpdateFailed: "Couldn't update the password.",
  successUpdated: 'Password updated. You can log back in.',
  errorUnexpected: 'Unexpected error',
};
