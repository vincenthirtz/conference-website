// lib/i18n/locales/admin-en/adminNewsEdit.ts
//
// Traductions ANGLAISES du namespace admin `adminNewsEdit`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminNewsEdit.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Edit news',
  breadcrumbNews: 'News',
  breadcrumbEdit: 'Edit',
  staffSpace: 'Staff space',
  heading: 'Edit news',
  subtitle: 'Update the content or status.',
  loading: 'Loading…',
  titleLabel: 'Title',
  slugLabel: 'Slug',
  slugPlaceholder: 'generated if left empty',
  tagLabel: 'Tag / category',
  tagPlaceholder: 'general, tournament, announcement...',
  tagHint: 'Used to filter news by category (simple slug).',
  imageLabel: 'Image',
  imageHint: 'PNG, JPEG or WebP, max 2 MB.',
  statusLabel: 'Status',
  statusDraft: 'Draft',
  statusPublished: 'Published',
  publishDateLabel: 'Publish date (if published)',
  excerptLabel: 'Excerpt',
  contentLabel: 'Content (markdown or text)',
  saving: 'Saving…',
  submit: 'Update',
  back: 'Back',
  errorGeneric: 'Unexpected error.',
};
