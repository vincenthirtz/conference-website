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

  sourcesTitle: 'Stream sources (OBS)',
  sourcesDescription:
    'In OBS, add a “Browser” source and paste the URL. It follows the current match, so you never have to touch it between games.',
  sourcesHint:
    'Replace “next” with a match id to pin a source to that game. Add &scale=1.25 to enlarge, &accent=RRGGBB to change the colour, &theme=light for a light waiting screen.',
  sourcesLockedBody:
    'Per-match stream sources are part of the Régie plan. Your space is on {plan}.',
  sourcesLockedCta: 'See the plans',
  source_scoreboard_name: 'Scoreboard',
  source_scoreboard_desc: 'Top banner: teams, score, format and match state.',
  source_teams_name: 'Team presentation',
  source_teams_desc: 'Full-frame card before kick-off: logos and match-up.',
  source_maps_name: 'Maps and veto',
  source_maps_desc:
    'Played maps with their score, or the veto while no map has been played.',
  source_countdown_name: 'Countdown',
  source_countdown_desc: 'Counts down to kick-off, on server time.',
  source_waiting_name: 'Waiting screen',
  source_waiting_desc: 'Opaque backdrop with your brand, between games.',
  source_scrims_name: 'Upcoming scrims',
  source_scrims_desc:
    'The space’s next public scrims (not just this tournament). One row per scrim (time, logos, teams) on a transparent background. Add &days=N for the horizon, &limit=N for the number of rows, &position=top or bottom to anchor them.',
  source_scrimResult_name: 'Scrim result',
  source_scrimResult_desc:
    'Both teams, the score and the winner on a transparent background — for the end-of-scrim screen. Follows the running scrim; otherwise the result that just came in, today’s next scrim (to set up the scene before the match) or the last one completed (under 24 h); &scrim=<slug> to pin one. The score shows as soon as it is validated on the site.',
  source_donAlert_name: 'Donation alert (HelloAsso)',
  source_donAlert_desc:
    'A “Thank you for this donation of €10!” alert for every HelloAsso donation the association receives, on a transparent background — to sit next to Streamlabs, which has no HelloAsso integration. Amount only: the donor’s name is never shown (they type it for their tax receipt, not for the stream). Donations already received when the source opens are not replayed. &goal=500 adds a gauge (total since midnight, or since &from=YYYY-MM-DD), &gauge=only shows just the gauge, &duration=8 sets how long an alert stays (3 to 30 s), &demo=1 sends fake donations to set up the scene.',
  source_don_name: 'Donate (HelloAsso QR)',
  source_don_desc:
    'The association’s donation QR code, same as the /don page. Add &layout=corner for a bottom-right inset to keep on screen during games.',
  source_day_name: 'Today’s matches',
  source_day_desc:
    'The day’s schedule (Paris time): kick-off times, match-ups, live scores, current match highlighted. Add &date=YYYY-MM-DD for another day, &limit=N for the number of rows.',
};
