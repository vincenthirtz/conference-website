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
    'A path served by the site (/…) or a full https URL. Empty = silent alert.',
  soundUrlInvalid: 'The sound must be a site path (/…) or an https:// URL.',
  volumeLabel: 'Volume',

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
};
