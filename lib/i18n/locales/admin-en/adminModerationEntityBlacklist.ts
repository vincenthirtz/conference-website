// lib/i18n/locales/admin-en/adminModerationEntityBlacklist.ts
//
// Traductions ANGLAISES du namespace admin `adminModerationEntityBlacklist`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminModerationEntityBlacklist.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Team & org blacklist',
  subtitle:
    'Team and org/association names banned for this tenant. An inactive entry is kept for history but no longer enforced.',
  alertHelp:
    'The blacklist never blocks: it alerts staff on team creation (exact same name = strong alert, name included in the submitted name = soft alert). Alerts land in the staff Discord channel.',
  addHeading: 'Add an entry',
  addHelp:
    'Type and name required. The name is matched against team creations: exact match = strong alert, inclusion = soft alert.',
  typeLabel: 'Type',
  typeTeam: 'Team',
  typeOrg: 'Org',
  nameLabel: 'Name',
  namePlaceholder: 'Team or org name',
  reasonLabel: 'Reason (optional)',
  reasonPlaceholder: 'Toxic behavior, cheating…',
  notesLabel: 'Internal notes (optional)',
  notesPlaceholder: 'Context, references…',
  adding: 'Adding…',
  addToBlacklist: 'Add to blacklist',
  searchPlaceholder: 'Search a name…',
  searchBtn: 'Search',
  filterAllTypes: 'All types',
  filterTeams: 'Teams',
  filterOrgs: 'Orgs',
  filterAllStatus: 'All statuses',
  filterActive: 'Active',
  filterInactive: 'Inactive',
  refresh: 'Refresh',
  emptyEntries: 'No entries in the blacklist.',
  entriesCount_one: '{total} entry',
  entriesCount_other: '{total} entries',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  editNamePlaceholder: 'Name',
  editReasonPlaceholder: 'Reason',
  editNotesPlaceholder: 'Internal notes',
  savingEdit: 'Saving…',
  saveEdit: 'Save',
  cancel: 'Cancel',
  bannedBy: 'Banned by: {who}',
  edit: 'Edit',
  deactivate: 'Lift ban',
  reactivate: 'Restore ban',
  delete: 'Delete',
  errorNameRequired: 'Name is required.',
  entryAdded: 'Entry added to the blacklist.',
  entryDeactivated: 'Ban lifted — the entry is kept for history.',
  entryReactivated: 'Ban restored.',
  entryUpdated: 'Entry updated.',
  confirmDeleteTitle: 'Delete this entry?',
  confirmDeleteSubtitle:
    '« {label} » will be permanently removed from the blacklist.',
  confirmDeleteLabel: 'Delete',
  entryDeleted: 'Entry deleted.',
  pagePrev: 'Previous',
  pageNext: 'Next',
  pageInfo: '{from}–{to} of {total}',
};
