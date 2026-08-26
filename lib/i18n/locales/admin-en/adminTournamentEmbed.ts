// lib/i18n/locales/admin-en/adminTournamentEmbed.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentEmbed`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentEmbed.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  panelTitle: 'Embed / Widgets',
  panelDescription:
    'Copy and paste these iframe snippets to embed the tournament widgets on an external site.',
  show: 'Show',
  hide: 'Hide',
  themeLabel: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  snippetLabel: 'iframe snippet',
  copyBtn: 'Copy',
  copiedBtn: 'Copied',
  copiedToast: 'Snippet copied',
  openWidget: 'Open widget',
  bracketName: 'Bracket',
  bracketDesc: 'The tournament bracket with scores and progression.',
  standingsName: 'Standings',
  standingsDesc: 'The team standings (wins, losses, points).',
  scheduleName: 'Schedule',
  scheduleDesc: 'The schedule of upcoming and completed matches.',
};
