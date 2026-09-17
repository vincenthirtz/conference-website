// lib/i18n/locales/en/overlay.ts
//
// Traductions ANGLAISES du namespace `overlay`.
//
// La SOURCE DE VERITE est le francais (`../fr/overlay.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  docTitle: 'Broadcast overlay',
  invalidRunId: 'Invalid run identifier.',
  connecting: 'Connecting to the control room…',
  live: 'Live',
  camera: 'Camera',
  sponsors: 'Partners',
  vs: 'VS',
  winner: 'Winner',
  logoAlt: '{name} logo',
  brandFallback: 'The competition',
  startingEyebrow: 'Starting soon',
  startingTitle: 'The stream is about to start',
  startingSubtitle: "Get comfy, it's coming.",
  pauseEyebrow: 'Intermission',
  pauseTitle: 'Break',
  pauseSubtitle: "We'll be right back.",
  endEyebrow: "That's a wrap",
  endTitle: 'Thanks for watching',
  customEyebrow: 'Live',
  resultTitle: 'Result',
  resultWithFormat: 'Result · {format}',
  resultNoMatchTitle: 'Match over',

  matchDocTitle: 'Stream source — match',
  matchMissingTournament:
    'Add ?tournament=<id or slug> to the URL to follow the current match.',
  matchWaitingTitle: 'Back on air shortly',
  matchWaitingSubtitle: 'The next match is coming up.',
  matchNothingScheduled: 'No match to show right now.',
  matchPhaseUpcoming: 'Upcoming',
  matchPhaseLive: 'Live',
  matchPhaseFinal: 'Final',
  matchCountdownLabel: 'Starts in',
  matchCountdownNow: 'Starting now',
  matchCountdownNoTime: 'Time to be confirmed',
  matchCountdownDays: '{days}d {time}',
  matchScheduledAt: 'Starts at {time}',
  matchMapsTitle: 'Maps',
  matchVetoTitle: 'Veto',
  matchMapBanned: 'Banned',
  matchMapPicked: 'Picked',
  matchMapDecider: 'Decider',
  matchTeamFallback: 'Team',

  dayDocTitle: 'Stream source — today’s matches',
  dayEyebrow: 'Today’s matches',
  dayEmpty: 'No matches scheduled that day.',
  dayMissingTournament:
    'Add ?tournament=<id or slug> to the URL to show the day’s matches.',
  dayTeamTbd: 'TBD',
  dayShownOf: 'Showing {shown} of {total} matches',

  scrimsDocTitle: 'Stream source — upcoming scrims',
  scrimsTitle: 'Upcoming scrims',
  scrimsBrandDefault: 'OW Women’s Cup',
  scrimsEmpty: 'No public scrims scheduled yet.',
  scrimsDateTbd: 'Date TBD',
  scrimsMore: '+ {count} more scheduled scrims',

  donDocTitle: 'Stream source — donate',
  donEyebrow: 'Donate',
  donTitle: 'Support the association',
  donBody: 'Scan the QR code to donate via HelloAsso.',
  donQrAlt: 'HelloAsso donation QR code',
};
