// lib/i18n/locales/admin-en/adminIdentity.ts
//
// ENGLISH counterpart of the `adminIdentity` namespace (source of truth is
// the French file).

export default {
  headTitle: 'Admin – Accounts and sign-in',
  title: 'Accounts and sign-in',
  subtitle: 'Better Auth: settings, figures and account actions. Owner only.',
  loadError: 'Could not load accounts.',
  unavailable:
    'The account database is not responding, or Better Auth is not the account source: figures and actions are unavailable.',

  overviewTitle: 'Status and figures',
  statAccounts: 'Accounts',
  statAccountsHint: '{unverified} unverified · {banned} suspended',
  statSessions: 'Active sessions',
  statSessionsHint: '{people} people · {aal2} with second factor',
  statSignIns: 'Sign-ins over 7 days',
  statSignInsHint: '{day} in 24 h · {people} people over 7 days',
  statTwoFactor: 'Two-factor authentication',
  statTwoFactorHint: 'protected accounts',
  statMethods: 'Password / Discord',
  statMethodsHint: '{discordOnly} account(s) only have Discord',
  statThrottled: 'Throttled addresses',
  statThrottledHint: 'too many sign-in attempts (5 min)',
  staffTitle: 'Staff without two-factor authentication',
  staffAll: 'All active staff ({count}) have two-factor authentication.',
  staffSome: '{missing} of {count} active staff members do not have it yet:',
  staffNoName: '(no name)',
  fixedTitle: 'Set in code',
  fixedMfa: 'Second factor required for the admin: {value}',
  yes: 'yes',
  no: 'no',
  fixedToken: 'Sign-in tokens valid for {minutes} min',
  fixedCache: 'Session re-read at most every {seconds} s',
  fixedSettings: 'Settings applied everywhere within {seconds} s',
  fixedAttempts: '{attempts} sign-in attempts per 5 min per address',

  settingsTitle: 'Settings',
  settingsMissing:
    'The add_auth_settings.sql migration is not applied yet: these are the default values and cannot be changed.',
  settingsUpdated: 'Changed on {date}',
  signupOpen: 'Sign-ups open',
  signupOpenHelp:
    'Closed: no new accounts, by email or Discord. Staff can still create accounts.',
  discordSignIn: 'Sign-in with Discord',
  discordSignInHelp:
    'Off: the {discordOnly} account(s) that only have Discord will no longer be able to sign in.',
  magicLink: 'Email sign-in link',
  magicLinkHelp:
    'Off for visitors only: Battle.net and team access keep working.',
  sessionDays: 'Session length (days)',
  sessionDaysHelp: 'Between 1 and 90. For new sign-ins and extended sessions.',
  save: 'Save',
  saved: 'Setting saved: applied everywhere within a minute.',
  saveError: 'Setting not saved: {error}',
  confirmDiscordOffTitle: 'Turn off sign-in with Discord?',
  confirmDiscordOffBody:
    '{discordOnly} account(s) only have Discord: they will not be able to sign in while this setting is off.',
  confirmSignupOffTitle: 'Close sign-ups?',
  confirmSignupOffBody:
    'Nobody will be able to create an account, by email or Discord, until they are reopened.',
  confirmOff: 'Turn off',

  accountsTitle: 'One account',
  searchLabel: 'Email address or display name',
  searchPlaceholder: 'At least 3 characters',
  search: 'Search',
  searching: 'Searching…',
  noResult: 'No account found.',
  accountsError: 'Search failed: {error}',
  verified: 'Address verified',
  unverified: 'Address not verified',
  twoFactorOn: 'Two-factor authentication',
  twoFactorOff: 'No two-factor authentication',
  sessions: '{count} active session(s)',
  providers: 'Methods: {list}',
  providerNone: 'none',
  providerCredential: 'password',
  providerDiscord: 'Discord',
  lastSignIn: 'Last sign-in: {date}',
  neverSignedIn: 'Never signed in',
  bannedUntil: 'Suspended until {date}',
  actionRevoke: 'Close their sessions',
  actionRemoveTwoFactor: 'Remove two-factor authentication',
  actionResend: 'Resend verification',
  confirmRevokeTitle: 'Close all sessions of {email}?',
  confirmRevokeBody:
    'They will have to sign in again everywhere (fully effective within 5 minutes).',
  confirmRemoveTitle: 'Remove two-factor authentication for {email}?',
  confirmRemoveBody:
    'Their sessions are closed and they are notified by email. They sign in with their password or Discord, then enrol again. Only after checking their identity.',
  confirmResendTitle: 'Resend the verification email to {email}?',
  confirmResendBody: 'A new link, valid for one hour.',
  confirmAction: 'Confirm',
  doneRevoke: '{count} session(s) closed.',
  doneRemove: 'Two-factor authentication removed, sessions closed.',
  doneRemoveNone:
    'This account had no two-factor authentication; its sessions are closed.',
  doneResend: 'Verification email sent.',
  doneResendFailed: 'The verification email was not sent.',
  actionError: 'Failed: {error}',

  dangerTitle: 'Emergency',
  dangerIntro:
    'If access has leaked. You will be signed out too: keep your two-factor code at hand.',
  signOutAllTitle: 'Sign everyone out',
  signOutAllDescription:
    'Closes every session, yours included. Tokens already issued expire within 5 minutes.',
  signOutAllAction: 'SIGN OUT',
  typeToConfirm: 'Type “{name}” to confirm',
  cancel: 'Cancel',
  signOutAllDone: '{count} session(s) closed. Back to sign-in…',
};
