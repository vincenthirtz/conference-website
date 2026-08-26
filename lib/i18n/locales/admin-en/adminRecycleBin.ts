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
  typeAnnouncement: 'Announcement',
  typePartner: 'Partner',
  typeCastMember: 'Caster',
  typeAdherent: 'Member',
  typeStaff: 'Staff',
  typeScrim: 'Scrim',
  backToDashboard: 'Back to dashboard',
  heading: 'Recycle bin',
  subtitle:
    'Deactivated or cancelled items. Restore them to bring them back into service.',
  countInBin_one: '{count} item in the recycle bin.',
  countInBin_other: '{count} items in the recycle bin.',
  filterAll: 'All types',
  filterStages: 'Stages',
  filterTeams: 'Teams',
  filterMatches: 'Matches',
  filterAnnouncements: 'Announcements',
  filterPartners: 'Partners',
  filterCastMembers: 'Casters',
  filterAdherents: 'Members',
  filterStaff: 'Staff',
  filterScrims: 'Scrims',
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
};
