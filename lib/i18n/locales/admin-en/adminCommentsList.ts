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
  // Status and filter
  filterLabel: 'Status',
  filterAll: 'All',
  filterPending: 'Pending',
  filterVisible: 'Visible',
  filterHidden: 'Hidden',
  statusVisible: 'Visible',
  statusPending: 'Pending',
  statusHidden: 'Hidden',
  pendingBadge: '{count} pending',
  // Selection and bulk actions
  selectComment: 'Select the comment by {author}',
  selectAllPage: 'Select all on this page',
  selectedCount: '{count} selected',
  clearSelection: 'Clear selection',
  bulkShow: 'Publish selection',
  bulkHide: 'Hide selection',
  bulkDelete: 'Delete selection',
  bulkDeleteTitle: 'Delete {count} comment(s)?',
  bulkDeleteBody: 'Permanent deletion. To remove reversibly, hide instead.',
  toastBulkShow: '{count} comment(s) published',
  toastBulkHide: '{count} comment(s) hidden',
  toastBulkDelete: '{count} comment(s) deleted',
  errorBulk: 'The action on the selection failed',
  statusUnavailable:
    'Statuses unavailable: the news_comments_moderation migration has not been applied. Only deletion is possible.',
  // Settings
  settingsHeading: 'Settings',
  preModerationLabel: 'Pre-moderation',
  preModerationHint:
    'When on, every new comment waits for approval before being published. When off, it is published as soon as it is sent.',
  toastPreModerationOn: 'Pre-moderation enabled',
  toastPreModerationOff: 'Pre-moderation disabled',
  errorSettings: 'Could not save the setting',
  closedArticlesHeading: 'Articles with comments closed',
  closedArticlesEmpty: 'No closed article.',
  closeArticle: 'Close comments',
  reopenArticle: 'Reopen',
  toastArticleClosed: 'Comments closed on “{title}”',
  toastArticleReopened: 'Comments reopened on “{title}”',
  errorClosure: 'Could not update the article',
};
