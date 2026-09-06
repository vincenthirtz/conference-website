// lib/i18n/locales/admin-en/adminModerationBlacklist.ts
//
// Traductions ANGLAISES du namespace admin `adminModerationBlacklist`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminModerationBlacklist.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Player blacklist',
  heading: 'Player blacklist',
  subtitle:
    'Players banned for this tenant. An inactive entry is kept for history but no longer enforced.',
  sourceBotScan: 'Bot scan',
  sourceBotMemberAdd: 'Member join',
  sourceRegistration: 'Site registration',
  addHeading: 'Add an entry',
  addHelp:
    'At least one identifier required: BattleTag, display name or Discord ID.',
  battleTagLabel: 'BattleTag',
  displayNameLabel: 'Display name',
  discordIdLabel: 'Discord ID',
  displayNamePlaceholder: 'Handle',
  reasonLabel: 'Reason (optional)',
  reasonPlaceholder: 'Toxic behavior, cheating…',
  notesLabel: 'Internal notes (optional)',
  notesPlaceholder: 'Context, references…',
  adding: 'Adding…',
  addToBlacklist: 'Add to blacklist',
  searchPlaceholder: 'Search (BattleTag, handle, Discord ID)…',
  searchBtn: 'Search',
  filterAllStatus: 'All statuses',
  filterActive: 'Active',
  filterInactive: 'Inactive',
  refresh: 'Refresh',
  emptyEntries: 'No entries in the blacklist.',
  pagePrev: 'Previous',
  pageNext: 'Next',
  pageInfo: '{from}–{to} of {total}',
  entriesCount_one: '{total} entry',
  entriesCount_other: '{total} entries',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  discordLine: 'Discord: {id}',
  editReasonPlaceholder: 'Reason',
  editNotesPlaceholder: 'Internal notes',
  savingEdit: 'Saving…',
  saveEdit: 'Save',
  cancel: 'Cancel',
  bannedBy: 'Banned by: {who}',
  edit: 'Edit',
  deactivate: 'Deactivate',
  reactivate: 'Reactivate',
  delete: 'Delete',
  historyHeading: 'Detection history',
  historySubtitle:
    'Log of matches detected by the bot (scan, member join) or during a registration on the site.',
  forceLabel: 'Strength',
  forceAll: 'All',
  forceStrong: 'Strong',
  forceSoft: 'Soft',
  sourceFilterLabel: 'Source',
  sourceAll: 'All',
  emptyAlerts: 'No detections recorded.',
  alertStrong: 'Strong',
  alertSoft: 'Soft',
  criterionLabel: 'Criterion:',
  contextLine: 'Context: {context}',
  loadMore: 'Load more',
  loadingMore: 'Loading…',
  errorIdentifierRequired:
    'At least one identifier required (BattleTag, handle or Discord ID).',
  entryAdded: 'Entry added to the blacklist.',
  entryDeactivated: 'Entry deactivated.',
  entryReactivated: 'Entry reactivated.',
  entryUpdated: 'Entry updated.',
  confirmDeleteTitle: 'Delete this entry?',
  confirmDeleteSubtitle:
    '« {label} » will be permanently removed from the blacklist.',
  confirmDeleteLabel: 'Delete',
  deleteFallbackLabel: 'this entry',
  entryDeleted: 'Entry deleted.',
  playerTagPlaceholder: 'Player#1234',
};
