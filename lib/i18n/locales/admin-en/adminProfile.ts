// lib/i18n/locales/admin-en/adminProfile.ts
//
// Traductions ANGLAISES du namespace admin `adminProfile`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminProfile.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – My profile',
  breadcrumbStaff: 'Staff area',
  breadcrumbCurrent: 'My profile',
  heading: 'My profile',
  subtitle: 'Summary of your staff account.',
  avatarAlt: 'Avatar',
  logout: 'Log out',
  tabProfile: 'Profile',
  tabSecurity: 'Security',
  tabPrivacy: 'Privacy',
  emailLabel: 'Email',
  roleLabel: 'Staff role',
  createdAtLabel: 'Profile created on',
  staffIdLabel: 'Staff ID',
  editHeading: 'Edit my profile',
  displayNameLabel: 'Display name',
  displayNamePlaceholder: 'Your staff handle',
  avatarUrlLabel: 'Avatar (URL)',
  avatarHelp: 'Optional. Leave empty to remove the avatar.',
  saving: 'Saving…',
  save: 'Save',
  emailHeading: 'Change my email',
  newEmailLabel: 'New email',
  emailSending: 'Sending…',
  emailSubmit: 'Change my email',
  emailConfirmNote: 'A confirmation email will be sent to your new address.',
  passwordHeading: 'Change my password',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'Confirm password',
  passwordChanging: 'Changing…',
  passwordSubmit: 'Change my password',
  passwordHelp: 'Minimum 8 characters.',
  dataHeading: 'My data',
  exporting: 'Exporting…',
  exportBtn: 'Download my data',
  exportHelp:
    'Retrieve all your personal information in JSON format (GDPR right of access).',
  deleteBtn: 'Delete my account',
  deleteHelp:
    'GDPR right to be forgotten — your account and all your data will be permanently deleted.',
  systemHeading: 'System information',
  userIdLabel: 'User ID',
  deleteDialogTitle: 'Delete my account',
  deleteDialogSubtitle: 'GDPR right to be forgotten',
  deleteConfirmLabel: 'Confirm deletion',
  deleteConfirmingLabel: 'Deleting…',
  cancelLabel: 'Cancel',
  deleteDialogBodyBefore: 'This action is ',
  deleteDialogBodyStrong: 'irreversible',
  deleteDialogBodyAfter:
    '. All your data, your staff role, and your memberships will be permanently deleted.',
  defaultDisplayName: 'Staff profile',
  toastEmailSent:
    'A confirmation email has been sent to your new address. Click the link to complete the change.',
  errorEmailChange: 'Error while changing email.',
  errorPasswordTooShort: 'The password must be at least 8 characters.',
  errorPasswordMismatch: "The passwords don't match.",
  toastPasswordChanged: 'Your password was changed successfully.',
  errorPasswordChange: 'Error while changing password.',
  toastProfileUpdated: 'Profile updated.',
  errorExport: 'Error during export.',
  errorDelete: 'Error during deletion.',
  errorUnexpected: 'Unexpected error',
  battlenetHeading: 'Verify my BattleTag',
};
