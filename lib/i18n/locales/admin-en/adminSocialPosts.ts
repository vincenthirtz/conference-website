// lib/i18n/locales/admin-en/adminSocialPosts.ts
//
// Traductions ANGLAISES du namespace admin `adminSocialPosts`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminSocialPosts.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure,
// sans quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  intro:
    'Write once, send to several destinations. Each one can carry its own text and its own image.',

  baseLegend: 'Shared content',
  baseTextLabel: 'Text',
  baseTextPlaceholder:
    'What you want to announce. Every destination inherits it unless it overrides it.',
  baseImageLabel: 'Image (public URL)',
  baseImagePlaceholder: 'https://…',
  baseImageHelp:
    'It must stay online after publishing: some platforms fetch it afterwards.',

  targetsLegend: 'Destinations',
  targetInherits: 'Inherits the shared text',
  targetOverride: 'Own text',
  targetUseOwnText: 'Write its own text',
  targetUseBaseText: 'Back to the shared text',
  targetOwnImage: 'Own image (URL)',
  targetTitleLabel: 'Article title',
  targetTitlePlaceholder: 'Taken from the first line if you leave this empty',
  charCount: '{count} characters',
  charCountLimited: '{count} / {limit} characters',
  charOver: '{over} too many',

  previewCta: 'Preview',
  publishCta: 'Publish',
  publishing: 'Publishing…',
  previewTitle: 'What will go out',
  previewEmpty: 'Tick at least one destination.',
  publishLocked: 'Read the preview before publishing.',
  confirmTitle: 'Publish this post?',
  confirmBody:
    'It will go out to {count} destination(s). Publishing can only be undone by hand on each platform.',
  confirmCta: 'Publish',

  resultDone: 'Published to every destination.',
  resultPartial:
    'Partly published: {sent} destination(s) out of {total}. The others are detailed below.',
  resultFailed: 'No destination received the post.',
  statusSent: 'Sent',
  statusFailed: 'Failed',
  statusPending: 'Pending',
  statusSkipped: 'Skipped',
  seePost: 'View',

  connectedAs: 'Connected account: {handle}',
  notConnected: 'Account not connected.',
  connectionExpired: 'The connection has expired.',
  connectCta: 'Connect the account',
  secretMissing: 'Setup: the Meta app secret is missing.',
  secretLabel: 'Meta app secret',
  secretPlaceholder: '32 hexadecimal characters',
  secretSaveCta: 'Save',
  secretHelp:
    'It is encrypted on save and never shown again. Meta reveals it once, in the app dashboard under app settings.',
  secretSaved: 'App secret saved. You can now connect the account.',
  secretError: 'The secret could not be saved.',
  historyTitle: 'Previous sends',
  historyEmpty: 'No post sent yet.',
  historyLoading: 'Loading…',
  loadError: 'Could not load.',
};
