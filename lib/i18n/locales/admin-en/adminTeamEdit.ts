// lib/i18n/locales/admin-en/adminTeamEdit.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamEdit`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamEdit.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errUnexpected: 'Unexpected error',
  toastTeamUpdated: 'Team updated',
  errRegister: 'Registration failed',
  toastRegistered: 'Team registered for the tournament',
  toastUnregistered: 'Team unregistered from the tournament',
  confirmIncompleteRoster: 'Incomplete roster: {count} player(s) of {min}',
  confirmIncompleteRosterDesc:
    "The team is below the roster size the tournament expects. You can register it anyway — the gap is recorded in the staff logs.",
  rosterGapWarning:
    'This team has {count} player(s) for {min} expected (coaches and managers excluded).',
  confirmUnregister: 'Unregister this team from this tournament?',
  errEmailOrUserId: 'Email or User ID required',
  errBattleTagRequired: 'BattleTag is required',
  errAddMember: 'Unable to add the member',
  toastMemberAdded: 'Member added',
  toastMemberEdited: 'Member updated',
  confirmDeleteMember: 'Remove {member} from the team?',
  toastMemberRemoved: 'Member removed',
  confirmSetCaptain: 'Set {member} as captain?',
  toastCaptainSet: 'Captain set',
  toastSwapDone: 'Swap completed',
  bulkPartial: '{success} applied, {failure} skipped',
  bulkSuccess: '{success} member(s) updated',
  confirmBulkRemove:
    "Remove {count} member(s) from the team? The captain is protected and won't be removed.",
  errNoValidImport: 'No valid rows to import',
  importPartial: '{success} BattleTag(s) imported, {failure} failed',
  importSuccess: '{success} BattleTag(s) imported',
  headTitle: 'Admin – Edit team',
  headTitleWithName: 'Admin – Edit team: {name}',
  breadcrumbTeams: 'Teams',
  breadcrumbTeam: 'Team',
  breadcrumbEdit: 'Edit',
  backToList: 'Back to list',
  loading: 'Loading...',
  active: 'Active',
  inactive: 'Inactive',
  generalInfo: 'General information',
  nameLabel: 'Name *',
  namePlaceholder: 'Team name',
  shortNameLabel: 'Tag / Short name',
  logoLabel: 'Logo',
  bannerLabel: 'Banner URL',
  countryLabel: 'Country',
  teamActive: 'Team active',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Team presentation',
  twitterLabel: 'Twitter',
  discordLabel: 'Discord',
  discordRoleIdLabel: 'Discord role ID',
  discordRoleIdHelp:
    'Pinged automatically for match announcements (T-15min, results).',
  websiteLabel: 'Website',
  saving: 'Saving...',
  save: 'Save',
  tournamentsTitle: 'Tournaments',
  registeredTitle: 'Registered ({count})',
  noRegistration: 'No registration',
  unregister: 'Unregister',
  registerToTournament: 'Register for a tournament',
  selectTournament: 'Select a tournament...',
  register: 'Register',
  systemInfoTitle: 'System information',
  teamIdLabel: 'Team ID',
  quickLinksTitle: 'Quick links',
  publicPage: 'Public page',
};
