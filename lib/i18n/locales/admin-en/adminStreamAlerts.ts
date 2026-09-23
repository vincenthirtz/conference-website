// lib/i18n/locales/admin-en/adminStreamAlerts.ts
//
// Traductions ANGLAISES du namespace admin `adminStreamAlerts`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStreamAlerts.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure,
// sans quoi le garde-fou de compilation `../admin-parity.ts` casse le
// typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Alert box settings',
  description:
    'What the “Alerts” source announces on air, and how. The source re-reads these settings every 5 s: a change applies mid-stream, no need to paste the URL into OBS again.',
  loadError: 'Could not load the alert settings.',
  saveError: 'Could not save.',
  saved: 'Alert settings saved.',
  save: 'Save',
  saving: 'Saving…',

  enabledLabel: 'Alerts on air',
  enabledHelp:
    'Kill switch: unchecking silences every alert at once, without touching the settings or removing the source from OBS. Applied immediately.',
  enabledOn: 'Alerts switched back on.',
  enabledOff: 'Alerts silenced.',

  durationLabel: 'Display duration',
  durationUnit: 's',
  durationHelp:
    'Between {min} and {max} seconds. Leave empty to keep the animation duration ({default} s).',
  durationInvalid: 'Duration must be between {min} and {max} seconds.',

  soundUrlLabel: 'Sound',
  soundUrlPlaceholder: '/sounds/alert.mp3',
  soundUrlHelp:
    'A path served by the site (/…) or a full https URL. Empty = silent alert. An uploaded file below TAKES PRECEDENCE over this URL; removing it falls back to it.',
  soundUrlInvalid: 'The sound must be a site path (/…) or an https:// URL.',
  volumeLabel: 'Volume',

  // --- Files (frame, sound) ----------------------------------------------
  frameLabel: 'Alert box frame',
  frameHelp:
    'PNG, JPEG or WebP image (2 MiB max), or MP4 / WebM video (8 MiB max). The file replaces the Women’s Cup frame in the OBS source.',
  frameChoose: 'Upload a frame',
  frameReplace: 'Replace the frame',
  frameReset: 'Back to the Women’s Cup frame',
  frameIsDefault:
    'Women’s Cup frame: the knot animation shipped with the site. That is the default, not the absence of a frame.',
  framePreviewAlt: 'Preview of the alert frame',
  frameResetPending:
    'On the next save, the box will go back to the Women’s Cup frame.',
  frameTypeRefused:
    'Frame rejected: accepted formats are PNG, JPEG, WebP, MP4, WebM.',
  frameTooLargeClient:
    'Frame too heavy ({size}): {max} maximum for this format.',

  soundFileLabel: 'Uploaded sound file',
  soundFileHelp:
    'MP3, OGG or WAV, 2 MiB max. An uploaded file takes precedence over the URL above; removing it falls back to it.',
  soundChoose: 'Upload a sound',
  soundReplace: 'Replace the sound',
  soundFileRemove: 'Remove the uploaded file',
  soundFileNone: 'No uploaded file, and no sound URL set.',
  soundFromFile: 'This sound comes from the uploaded file.',
  soundFromUrl: 'This sound comes from the URL above.',
  soundRemovePending:
    'On the next save, the file will be removed: the sound falls back to the URL, or goes silent if it is empty.',
  soundTypeRefused: 'Sound rejected: accepted formats are MP3, OGG, WAV.',
  soundTooLargeClient: 'Sound too heavy ({size}): {max} maximum.',

  filePending: 'Ready to upload: {name}. Click “Save” to apply it.',
  fileSizeUnit: 'MiB',
  fileUnreadable: 'Unreadable file: export it again, then retry.',
  fileUnsupportedType: 'File format rejected by the server.',
  fileTooLarge: 'File too heavy: {max} maximum.',
  fileTooLargeAny: '2 MiB for a sound or an image, 8 MiB for a video',
  fileContentMismatch: 'The file contents do not match the declared format.',
  fileAlphaNeedsVp9Profile0:
    'This transparent video is VP9 profile 1, which the OBS browser cannot decode — your alerts would show text only. Re-export it as VP9 profile 0 (or VP8); transparency is preserved.',

  accentLabel: 'Accent colour',
  accentHelp: 'Overlay tint. “Default” restores the brand colour.',
  accentReset: 'Default',
  accentInvalid: 'The accent colour must be a #RRGGBB hex code.',
  accentIsDefault: 'Default colour',

  rulesTitle: 'Per alert type',
  rulesHint:
    'The sentence accepts two tokens: {name} (the nickname, or “Someone” when Twitch gives none) and {amount} (the already formatted quantity). Leaving it empty restores the default sentence, shown in grey.',
  messageAria: 'Sentence announced for “{kind}”',
  thresholdAria: 'Announcement threshold for “{kind}”',
  thresholdPlaceholder: 'None',
  thresholdInvalid: 'The “{kind}” threshold must be a positive number.',
  rulesThresholdHint:
    'The threshold only announces above the given quantity — enough to survive a raid night without a queue of “1 bit”. It exists only for types that carry a quantity.',

  kind_follow: 'New follow',
  kind_sub: 'Subscription',
  kind_resub: 'Resubscription',
  kind_gift: 'Gifted subs',
  kind_cheer: 'Bits',
  kind_raid: 'Raid',
  kind_donation: 'Donation',

  unit_resub: 'months',
  unit_gift: 'subs',
  unit_cheer: 'bits',
  unit_raid: 'viewers',
  unit_donation: '€',
  twitchHeading: 'Twitch events',
  twitchHelp:
    'For subs, follows, bits and raids to reach the box, Twitch must be subscribed to the channel. HelloAsso donations do not depend on it.',
  twitchCount: '{active}/{total} active',
  twitchSubOk: 'active',
  twitchSubMissing: 'not subscribed',
  twitchSubMissingScope:
    '{scope} permission missing — reconnect the channel (Broadcast → Live)',
  twitchSecretMissing:
    'TWITCH_EVENTSUB_SECRET missing on the server: no subscription possible.',
  twitchUnreadable:
    'Twitch subscription list unreadable right now: the state below may be incomplete.',
  twitchSubscribe: 'Enable Twitch events',
  twitchSubscribing: 'Enabling…',
  twitchSubscribed: 'Twitch events enabled.',
  twitchSubscribedPartial: 'Partially enabled: see the per-type detail.',
  twitchSubscribeError: 'Could not enable.',
  testHeading: 'Test alert',
  testHelp:
    'Sends a fake alert to the “Alerts” OBS source, through the same path as a real Twitch event: it shows up within 5 s. The settings below apply — a disabled type or a high threshold filters it out. Streamlabs’ “replay” does not reach this source.',
  testKindLabel: 'Alert type',
  testButton: 'Send a test alert',
  testSending: 'Sending…',
  testSent: 'Test alert sent.',
  testError: 'Could not send the test alert.',
};
