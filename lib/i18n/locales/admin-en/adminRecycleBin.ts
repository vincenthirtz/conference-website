// lib/i18n/locales/admin-en/adminRecycleBin.ts
//
// Traductions ANGLAISES du namespace admin `adminRecycleBin`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminRecycleBin.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Recycle bin',
  typeStage: 'Stage',
  typeTeam: 'Team',
  typeMatch: 'Match',
  typePartner: 'Partner',
  typeCastMember: 'Caster',
  typeAdherent: 'Member',
  typeStaff: 'Staff',
  typeScrim: 'Scrim',
  typeScrimPlanning: 'Scrim planning',
  typeTask: 'Task',
  typeNews: 'News',
  backToDashboard: 'Back to dashboard',
  heading: 'Recycle bin',
  subtitle:
    'Deactivated or cancelled items. Restore them to bring them back into service.',
  countInBin_one: '{count} item in the recycle bin.',
  countInBin_other: '{count} items in the recycle bin.',
  filterTypeLabel: 'Type',
  filterAll: 'All types',
  filterStages: 'Stages',
  filterTeams: 'Teams',
  filterMatches: 'Matches',
  filterPartners: 'Partners',
  filterCastMembers: 'Casters',
  filterAdherents: 'Members',
  filterStaff: 'Staff',
  filterScrims: 'Scrims',
  filterScrimPlannings: 'Scrim plannings',
  filterTasks: 'Tasks',
  filterNews: 'News',
  refresh: 'Refresh',
  empty: 'The recycle bin is empty.',
  deletedOn: 'Deleted on {date}',
  restoring: 'Restoring…',
  restore: 'Restore',
  previous: 'Previous',
  next: 'Next',
  paginationTotal: ' of {total}',
  confirmRestoreTitle: 'Restore {type} "{name}"?',
  confirmRestoreLabel: 'Restore',
  toastRestored: '{type} "{name}" restored successfully.',
  errorUnexpected: 'Unexpected error',
  errorRestore: 'Error during restore',
  retentionNotice:
    'Plannings, tasks, news, partners and members left in the recycle bin for 90 days are permanently deleted.',
  purge: 'Delete permanently',
  purging: 'Deleting…',
  confirmPurgeTitle: 'Permanently delete {type} "{name}"?',
  confirmPurgeSubtitle:
    'This cannot be undone: the item and what depends on it (comments, availabilities…) will be erased. A member with membership payments is anonymized.',
  confirmPurgeLabel: 'Delete permanently',
  toastPurged: '{type} "{name}" permanently deleted.',
  errorPurge: 'Error during permanent deletion',
};
