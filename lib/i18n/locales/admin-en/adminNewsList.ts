// lib/i18n/locales/admin-en/adminNewsList.ts
//
// Traductions ANGLAISES du namespace admin `adminNewsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminNewsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – News',
  heading: 'News management',
  count_one: '{count} article',
  count_other: '{count} articles',
  newButton: 'New article',
  retry: 'Retry',
  searchLabel: 'Search',
  searchPlaceholder: 'Title or slug...',
  statusLabel: 'Status',
  statusAll: 'All statuses',
  statusDraft: 'Draft',
  statusPublished: 'Published',
  searchButton: 'Search',
  emptyState: 'No news found',
  createdOn: 'Created on {date}',
  publishedOn: 'Published on {date}',
  edit: 'Edit',
  delete: 'Delete',
  previous: 'Previous',
  next: 'Next',
  paginationOf: ' of {total}',
  deleteModalTitle: 'Delete this article?',
  deleteModalPrefix: 'Delete the article',
  errorDelete: 'Deletion error.',
};
