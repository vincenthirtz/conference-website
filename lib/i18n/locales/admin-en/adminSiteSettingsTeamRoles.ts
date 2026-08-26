// lib/i18n/locales/admin-en/adminSiteSettingsTeamRoles.ts
//
// Traductions ANGLAISES du namespace admin `adminSiteSettingsTeamRoles`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminSiteSettingsTeamRoles.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Team roles',
  back: 'Back to site settings',
  heading: 'Team roles',
  subtitle:
    'Configure the list of roles offered in the team forms (add / edit member).',
  listHeading: 'Role list',
  listHelp:
    'The identifier is stored in the database. The label is shown in the selects.',
  captainLabel: 'Captain',
  captainBadge: 'Built-in',
  captainHint:
    'Implicit role of the team creator — always holds every permission and cannot be edited or removed.',
  captainAllPermissions: 'All permissions',
  addRole: 'Add a role',
  emptyRoles: 'No roles. Add at least one entry.',
  moveUp: 'Move up',
  moveDown: 'Move down',
  idLabel: 'Identifier',
  labelLabel: 'Label',
  removeRoleTitle: 'Delete this role',
  permissionsGranted: 'Permissions granted by this role',
  recapHeading: 'Permissions summary',
  orphan_one: '1 permission is granted by no role',
  orphan_other: '{count} permissions are granted by no role',
  orphanSuffix: '— only the captain will be able to perform these actions.',
  noRoleCaptainOnly: 'No role — captain only',
  saving: 'Saving...',
  save: 'Save',
  cancelChanges: 'Cancel changes',
  restoreDefaults: 'Restore defaults',
  footerPart1:
    'Existing members keep their current role even if you remove that role from the list — only the form picker is affected. The link to this page is also accessible from',
  footerLink: 'Site settings',
  footerSuffix: '.',
  removeConfirmTitle: 'Delete this role?',
  removeConfirmSubtitle:
    'The role "{value}" will no longer be offered in the forms. Existing members keep their current role.',
  removeConfirmSubtitleGeneric: 'Delete this line?',
  removeConfirmLabel: 'Delete',
  restoreConfirmTitle: 'Restore the default list?',
  restoreConfirmSubtitle:
    'The role list will be replaced with the default values (player, coach, sub, manager). Remember to save to persist.',
  restoreConfirmLabel: 'Restore',
  errorIdRequired: 'Each role must have an identifier.',
  errorIdInvalid:
    'Invalid identifier "{value}" (lowercase letters, digits, "-" or "_", max 32).',
  errorIdDuplicate: 'Duplicate identifier: "{value}".',
  errorAtLeastOne: 'At least one role is required.',
  saveSuccess: 'Roles saved',
};
