// lib/i18n/locales/admin-en/adminNewsNew.ts
//
// Traductions ANGLAISES du namespace admin `adminNewsNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminNewsNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – New article',
  back: 'Back to news list',
  heading: 'New article',
  subtitle: 'Publish a news article for the site.',
  sectionGeneral: 'General information',
  titleLabel: 'Title',
  titlePlaceholder: 'Article title',
  slugLabel: 'Slug (URL)',
  slugPlaceholder: 'will-be-generated-if-empty',
  slugHint: 'Leave empty to generate automatically.',
  tagLabel: 'Tag / category',
  tagPlaceholder: 'general, tournament, announcement...',
  tagHint: 'Used to filter news by category.',
  imageLabel: 'Image',
  imageHint: 'PNG, JPEG or WebP, max 2 MB.',
  excerptLabel: 'Excerpt',
  excerptPlaceholder: 'Short summary of the article...',
  sectionContent: 'Content',
  contentLabel: 'Content (markdown or text)',
  contentPlaceholder: '# Title\n\nArticle content in markdown...',
  sectionPublication: 'Publication',
  statusLabel: 'Status',
  statusDraft: 'Draft',
  statusPublished: 'Published',
  publishDateLabel: 'Publication date',
  publishDateHint: 'Leave empty to use the current date.',
  creating: 'Creating...',
  submit: 'Create article',
  cancel: 'Cancel',
  sectionPreview: 'Preview',
  sectionInfo: 'Information',
  infoDraft: 'The article will be created as a draft by default.',
  infoMarkdown: 'The content supports Markdown format.',
  infoTag: 'The tag lets you categorize and filter news.',
  errorGeneric: 'Unexpected error.',
};
