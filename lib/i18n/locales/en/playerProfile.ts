// lib/i18n/locales/en/playerProfile.ts
//
// Traductions ANGLAISES du namespace `playerProfile`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerProfile.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  defaultName: 'Player',
  profileUpdated: 'Profile updated.',
  genericError: 'Error',
  emailConfirmSent:
    'A confirmation email has been sent to your new address. Click the link to complete the change.',
  emailChangeError: 'Error while changing email.',
  passwordTooShort: 'Password must contain at least 8 characters.',
  passwordMismatch: 'Passwords do not match.',
  passwordChanged: 'Your password has been changed successfully.',
  passwordChangeError: 'Error while changing password.',
  exportError: 'Error during export.',
  deleteError: 'Error during deletion.',
  avatarAlt: 'Avatar',
  signedOutTitle: 'My profile',
  signedOutText: 'Sign in to access your player profile.',
  signIn: 'Sign in',
  roleCaptain: 'Captain',
  rolePlayer: 'Player',
  backToDashboard: 'Dashboard',
  pageTitle: 'My profile',
  pageSubtitle: 'Manage your account, email, password and data.',
  email: 'Email',
  battleTag: 'BattleTag',
  createdOn: 'Account created on',
  userId: 'User ID',
  editProfile: 'Edit my profile',
  displayNameLabel: 'Display name',
  displayNamePlaceholder: 'Your nickname',
  battleTagPlaceholder: 'Name#1234',
  setupBattleTagTitle: 'Your BattleTag is missing',
  setupBattleTagBody:
    'Your Discord account is linked. Now add your BattleTag: it is what identifies you on your team roster and in game.',
  twitchLabel: 'Twitch channel',
  twitchPlaceholder: 'your_twitch_name',
  twitchHelp:
    'Your Twitch username or channel URL: it shows on your public profile and on your teams’ rosters. Your captain can also fill it in for you — what you enter here takes precedence. Empty = your own channel is removed.',
  avatarLabel: 'Avatar (URL)',
  avatarPlaceholder: 'https://…',
  avatarHelp: 'Leave empty to remove the avatar.',
  saving: 'Saving...',
  save: 'Save',
  changeEmail: 'Change my email',
  newEmailLabel: 'New email',
  newEmailPlaceholder: 'new@email.com',
  sending: 'Sending...',
  changeEmailBtn: 'Change my email',
  emailHelp: 'A confirmation email will be sent to the new address.',
  changePassword: 'Change my password',
  newPasswordLabel: 'New password',
  confirmPasswordLabel: 'Confirm password',
  updatingPassword: 'Updating...',
  changePasswordBtn: 'Change my password',
  passwordHelp: 'Minimum 8 characters.',
  myData: 'My data',
  exporting: 'Exporting...',
  downloadData: 'Download my data',
  exportConfirmText:
    'containing all your personal information (account, teams, requests) will be downloaded.',
  aFile: 'A file',
  confirmDownload: 'Confirm download',
  cancel: 'Cancel',
  dataHelp:
    'Retrieve all your personal information in JSON format (GDPR right of access).',
  deleteAccount: 'Delete my account',
  deleteWarningStart: 'This action is',
  deleteWarningBold: 'irreversible',
  deleteWarningEnd:
    '. All your data, your team membership and your requests will be permanently deleted.',
  deleting: 'Deleting...',
  confirmDelete: 'Confirm deletion',
  deleteHelp:
    'GDPR right to erasure — your account and all your data will be permanently deleted.',
  currentPasswordLabel: 'Current password',
  currentPasswordPlaceholder: 'Your current password',
  wrongCurrentPassword: 'Current password is incorrect.',
  currentPasswordRequired: 'Enter your current password to confirm.',
  reauthHelp:
    'For your security, confirm your current password before changing your account.',
  signedOutAfterPasswordChange:
    'Password changed. For your security, all your sessions have been signed out. Sign back in with your new password.',
  battlenetTitle: 'Verify my BattleTag',
  battlenetWhy:
    'Link your Battle.net account to prove this BattleTag is really yours. Your team earns a trust badge on the roster, and it protects the competition against smurfs.',
  battlenetVerifyBtn: 'Verify my Battle.net account',
  battlenetVerifiedTitle: 'Battle.net account verified',
  battlenetVerifiedProof:
    'This BattleTag genuinely belongs to you: anti-impersonation and anti-smurf proof.',
  battlenetVerifiedOn: 'Verified on {date}',
  battlenetToastVerified: 'Your BattleTag is verified ✅',
  battlenetToastNoMatch:
    "Battle.net account linked, but it doesn't match any BattleTag on your rosters. Make sure the tag entered in your team matches this account.",
  battlenetToastAlreadyLinked:
    'This Battle.net account is already linked to another player.',
  battlenetToastError: 'Verification failed, please try again.',
  roleManager: 'Manager',
  roleCoach: 'Coach',
  roleSubstitute: 'Substitute',
};
