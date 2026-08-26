// lib/i18n/locales/admin-en/adminUsersNew.ts
//
// Traductions ANGLAISES du namespace admin `adminUsersNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminUsersNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  roleOwner: 'Owner',
  roleAdmin: 'Admin',
  roleCaster: 'Caster',
  rolePlayer: 'Player',
  roleMember: 'Member',
  headTitle: 'Admin – Create a user',
  heading: 'New user',
  subtitle: 'Create an account and optionally add it to a team',
  backToList: 'Back to list',
  errSelectTeam: 'Please select a team',
  errBattleTagRequired: 'BattleTag required (format Name#0000)',
  errBattleTagInvalid: 'Invalid BattleTag format (e.g. Name#1234)',
  errCreateUser: 'Unable to create the user',
  errInvalidEmail: 'Invalid email address',
  errEmailExists:
    'An account already exists with this email address. Look it up in user management instead of creating a second one.',
  errWeakPassword:
    'The password must be at least {min} characters (or leave the field empty to generate one).',
  errInvalidRole: 'Unknown role',
  errRoleForbidden:
    'You cannot create an account whose role is equal to or above your own.',
  errLoadTeams: 'Could not load the team list.',
  errResend: 'Could not resend the credentials',
  retry: 'Retry',
  errTeamAssign: 'User created but error adding to the team: {error}',
  toastCreated: 'Account created successfully',
  errUnexpected: 'Unexpected error',
  successTitle: 'Account created successfully',
  userIdLabel: 'User ID:',
  emailLabel: 'Email:',
  passwordSentByEmail: 'The password has been emailed to the user.',
  resendCredentials: 'Resend credentials',
  resending: 'Sending…',
  toastCredentialsSent: 'Credentials resent by email',
  staffAccessGranted: 'Back-office access granted ({role} role).',
  staffRoleWarning:
    'This role grants back-office access: a “{role}” staff account will be created.',
  openUserSpace: 'Open the account page',
  openTeam: 'View the team',
  emailNotSent:
    "The welcome email could not be sent: nobody knows this account's password. Resend it (a new password will be generated).",
  teamAssignedTitle: 'Added to team',
  teamLabel: 'Team:',
  roleLabelColon: 'Role:',
  setCaptainSuccess: 'Set as captain',
  createAnother: 'Create another user',
  sectionLogin: 'Login information',
  emailField: 'Email',
  passwordField: 'Password',
  passwordPlaceholder: 'Leave blank to generate',
  passwordHelp:
    'Empty = auto-generated password (otherwise {min} characters minimum)',
  sectionProfil: 'Profile',
  displayNameField: 'Display name',
  displayNamePlaceholder: 'Player nickname',
  systemRoleField: 'System role',
  sectionAttachTeam: 'Attach to a team',
  enable: 'Enable',
  teamField: 'Team',
  selectTeam: 'Select a team',
  loadingTeams: 'Loading teams...',
  battleTagField: 'BattleTag',
  battleTagPlaceholder: 'Name#1234',
  battleTagHelp: 'Format: Name#0000',
  teamRoleField: 'Role in the team',
  setCaptain: 'Set as captain',
  cancel: 'Cancel',
  creating: 'Creating...',
  submit: 'Create user',
  infoTitle: 'Information',
  infoServiceRole: 'The account is created via the Supabase service role',
  infoEmailConfirmed: 'The email is automatically marked as confirmed',
  infoPasswordGenerated: 'The password is generated if left blank',
  infoStaffRole:
    'A Caster / Admin / Owner role also creates the matching staff account',
  teamAttachTitle: 'Team attachment',
  teamInfoBattleTag: 'The BattleTag must be in the format Name#0000',
  teamInfoAddedMembers: 'The user will be added to team_members',
  teamInfoCaptain: 'If captain, teams.captain_id will be updated',
};
