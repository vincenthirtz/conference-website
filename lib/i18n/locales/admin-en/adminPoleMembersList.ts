// lib/i18n/locales/admin-en/adminPoleMembersList.ts
//
// Traductions ANGLAISES du namespace admin `adminPoleMembersList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPoleMembersList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Association teams',
  heading: 'Association teams',
  summary_one: '{count} member total — spread across {poles} teams.',
  summary_other: '{count} members total — spread across {poles} teams.',
  addButton: 'Add a member',
  searchLabel: 'Search',
  searchPlaceholder: 'Name or role...',
  poleLabel: 'Team',
  poleAll: 'All teams',
  memberCount_one: '{count} member',
  memberCount_other: '{count} members',
  emptyPole: 'No members in this team.',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  order: 'Order',
  deactivate: 'Deactivate',
  activate: 'Activate',
  edit: 'Edit',
  delete: 'Delete',
  deleteConfirmTitle: 'Delete this team member?',
  errorDeleteFailed: 'Unable to delete',
  errorDelete: 'Delete error.',
  errorUpdateFailed: 'Unable to update',
  errorUpdate: 'Update error.',
};
