// lib/i18n/locales/admin-en/adminAnnouncementsList.ts
//
// Traductions ANGLAISES du namespace admin `adminAnnouncementsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminAnnouncementsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Announcements',
  heading: 'Announcement management',
  count_one: '{count} announcement',
  count_other: '{count} announcements',
  loading: 'Loading...',
  newButton: 'New announcement',
  retry: 'Retry',
  searchLabel: 'Search',
  searchPlaceholder: 'Title or message...',
  statusLabel: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  searchButton: 'Search',
  emptyState: 'No announcements found',
  priority: 'Priority {priority}',
  ctaLabel: 'CTA: {label}',
  startAt: 'Start: {date}',
  endAt: 'End: {date}',
  edit: 'Edit',
  delete: 'Delete',
  previous: 'Previous',
  next: 'Next',
  paginationOf: ' of {total}',
  deleteModalTitle: 'Delete this announcement?',
  deleteModalPrefix: 'Delete the announcement',
  errorLoad: 'Error while loading',
  errorDeleteFailed: 'Unable to delete',
  errorDelete: 'Delete error.',
};
