// lib/i18n/locales/en/newsDetail.ts
//
// Traductions ANGLAISES du namespace `newsDetail`.
//
// La SOURCE DE VERITE est le francais (`../fr/newsDetail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  backHome: '← Back to home',
  newsLabel: 'News',
  noContent: 'No content for this news.',
  rssFeed: 'RSS feed',
  commentsTitle: 'Comments',
  commentContentSrLabel: 'Your comment',
  commentPlaceholder: 'Share your thoughts...',
  commentAuthorSrLabel: 'Name (optional)',
  authorPlaceholder: 'Name (optional)',
  captchaSrLabel: 'Anti-spam question: how much is {question}?',
  captchaSrLabelFallback: 'Anti-spam question',
  captchaPlaceholder: 'How much is {question}?',
  captchaLoading: 'Loading...',
  submitting: 'Sending...',
  publish: 'Publish',
  emptyComments: 'No comment yet.',
  anonymous: 'Anonymous',
  errFetchComments: 'Unable to fetch comments',
  errLoadComments: 'Error loading comments',
  errTooShort: 'The comment must contain at least 3 characters.',
  errPublish: 'Unable to publish the comment',
  errPublishGeneric: 'Error during publication',
  published: 'Comment published.',
};
