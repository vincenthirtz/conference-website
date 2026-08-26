// lib/i18n/locales/admin-en/adminCommentsList.ts
//
// Traductions ANGLAISES du namespace admin `adminCommentsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminCommentsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Comments',
  heading: 'Comments',
  count_one: '{count} comment',
  count_other: '{count} comments',
  loading: 'Loading...',
  searchLabel: 'Search',
  searchPlaceholder: 'Content or author...',
  searchButton: 'Search',
  emptyState: 'No comments found',
  anonymous: 'Anonymous',
  articleFallback: 'Article',
  saving: 'Saving...',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  deleting: 'Deleting...',
  previous: 'Previous',
  next: 'Next',
  paginationOf: ' of {total}',
  deleteModalTitle: 'Delete this comment?',
  deleteModalSubtitle: 'This action is irreversible',
  byAuthor: 'By {author}',
  toastDeleted: 'Comment deleted',
  toastUpdated: 'Comment updated',
  errorDelete: 'Error while deleting',
  errorUpdate: 'Error while updating',
};
