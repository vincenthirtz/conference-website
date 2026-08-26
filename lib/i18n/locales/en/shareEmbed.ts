// lib/i18n/locales/en/shareEmbed.ts
//
// Traductions ANGLAISES du namespace `shareEmbed`.
//
// La SOURCE DE VERITE est le francais (`../fr/shareEmbed.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  button: 'Share / Embed',
  dialogTitle: 'Share / Embed',
  close: 'Close',
  linkSectionTitle: 'Tournament link',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  share: 'Share',
  genericName: 'this tournament',
  shareText: 'Follow {name} live',
  shareTextGeneric: 'Follow this tournament live',
  shareOnX: 'Share on X',
  shareOnBluesky: 'Share on Bluesky',
  shareError: 'Copy failed. Please copy the link manually.',
  embedTitle: 'Embed on your site',
  embedDescription:
    'Copy and paste these iframe snippets to display the tournament widgets on your site.',
  themeLabel: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  accentToggle: 'Accent colour',
  accentPickerLabel: 'Pick the accent colour',
  bracketName: 'Bracket',
  standingsName: 'Standings',
  scheduleName: 'Schedule',
  ffaName: 'FFA',
  snippetCopied: 'Snippet copied',
  copyBtn: 'Copy',
  copiedBtn: 'Copied',
  openWidget: 'Open widget',
};
