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
    'Copied to our own storage when publishing to the site: a Discord attachment expires within 24h.',
  hashtagsLabel: 'Hashtags',
  hashtagsPlaceholder: 'Search or create a tag…',
  hashtagsHelp:
    'Appended to the message and counted against the character limit. On Bluesky they become real clickable links.',
  hashtagsRemove: 'Remove',
  hashtagsAdd: 'Add',
  hashtagsNoMatch: 'No known tag matches.',
  hashtagsFull: 'Maximum number of tags reached.',
  discordMentionsWarning:
    '{count} Discord mention(s) found (<@…>). They will be removed from non-Discord destinations, which cannot display them: write the names out if you want them there.',

  editorBold: 'Bold',
  editorItalic: 'Italic',
  editorHeading: 'Heading',
  editorList: 'List',
  editorQuote: 'Quote',
  editorLink: 'Link',
  editorPreview: 'Preview',
  editorWrite: 'Write',
  editorPreviewEmpty: 'Nothing to preview.',
  markdownNote:
    'Formatting is Markdown. Each destination gets what it can display: the site renders it, Discord keeps it, Instagram drops it.',

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
  accountLastError: 'Last error: {error}',
  reconnectCta: 'Reconnect',
  oauthConnected: '{platform} connected: {handle}.',
  oauthCancelled: '{platform} connection cancelled.',
  oauthError: 'Could not connect {platform}: {reason}',
  oauthReasonNotConfigured:
    'the app is not configured (missing App ID or secret).',
  oauthReasonMissingCode: 'no authorization code came back.',
  oauthReasonBadState:
    'the connection link expired or was opened from another session. Click “Reconnect” again and finish within 10 minutes.',
  oauthReasonNoAccount: 'no professional account is linked to this authorization.',
  oauthReasonExchangeFailed:
    'the token exchange was refused. The details are shown under the account.',
  connectCta: 'Connect the account',
  secretMissing: 'Setup: the Instagram app secret is missing.',
  secretLabel: 'Instagram app secret',
  secretPlaceholder: '32 hexadecimal characters',
  secretSaveCta: 'Save',
  secretReplaceCta: 'Replace the Instagram app secret',
  secretHelp:
    'Instagram’s, not the Meta app’s: dashboard › Instagram › API setup with Instagram login › Business login settings. It is encrypted on save and never shown again.',
  secretSaved: 'App secret saved. You can now connect the account.',
  secretError: 'The secret could not be saved.',
  blueskyMissing: 'Setup: add the Bluesky account.',
  blueskyHandleLabel: 'Bluesky handle',
  blueskyPasswordLabel: 'App password',
  blueskyHelp:
    'Create an app password in Bluesky › Settings › Privacy and security. Do not use the account password: an app password can be revoked in one click, the other cannot.',
  blueskySaved: 'Bluesky account connected.',
  blueskyError: 'The credentials could not be saved.',

  tiktokMirrorLegend: 'Discord mirror — TikTok',
  tiktokMirrorIntro:
    'Automatically mirrors videos posted on the TikTok account into the configured Discord channel, including those posted from a phone. Read-only: you cannot publish to TikTok from here.',
  tiktokConnectedAs: 'Connected TikTok account: {handle}',
  tiktokNotConnected: 'TikTok account not connected.',
  tiktokCredentialsMissing:
    'Setup: add the TikTok app client key and client secret.',
  tiktokConnectCta: 'Connect the TikTok account',
  tiktokReplaceCta: 'Replace the TikTok credentials',
  tiktokKeyLabel: 'Client key',
  tiktokSecretLabel: 'Client secret',
  tiktokHelp:
    'Create an app on developers.tiktok.com, add the Login Kit product with the user.info.basic and video.list scopes, then share the association account with the app sandbox. Both values are in the Credentials tab; they are encrypted on save and never shown again.',
  tiktokRedirectLabel:
    'Redirect URI to declare in the TikTok app, character for character:',
  tiktokSaved: 'TikTok credentials saved. You can now connect the account.',
  tiktokError: 'The credentials could not be saved.',
  historyTitle: 'Previous sends',
  historyEmpty: 'No post sent yet.',
  historyLoading: 'Loading…',
  loadError: 'Could not load.',
};
