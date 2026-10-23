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

  statsTitle: 'Pre-match',
  statsRankLabel: 'Standing',
  statsRank: '#{rank}',
  statsRankFirst: '#1',
  statsRecordLabel: 'Record',
  statsRecord: '{wins}W – {losses}L',
  statsRecordDraws: '{wins}W – {draws}D – {losses}L',
  statsMapDiffLabel: 'Map diff',
  statsFormLabel: 'Form',
  statsHeadToHeadLabel: 'Head-to-head',
  statsFirstMeeting: 'First meeting in the tournament',
  statsHeroBansLabel: 'Top bans',
  statsHeroBanCount: '{name} ×{count}',
  statsPoolDate: 'Map pool · {date}',
  statsPoolRound: 'Map pool · {round}',
  statsPoolTournament: 'Tournament map pool',
  statsPoolCatalog: 'Map pool',
  statsMapRecord: '{wins}–{losses}',

  dayDocTitle: 'Stream source — today’s matches',
  dayMissingTournament:
    'Add ?tournament=<id or slug> to the URL to show the day’s matches.',
  dayTeamTbd: 'TBD',

  finalsDocTitle: 'Stream source — finals',
  finalsMissingTournament:
    'Add ?tournament=<id or slug> to the URL to show the finals.',
  finalsTitle: 'The finals',
  finalsTitleOne: 'The final',
  finalsGrand: 'Grand final',
  finalsSmall: 'Third-place match',
  finalsKickoff: 'Kick-off',
  finalsChampions: 'Champions',
  finalsRunnersUp: 'Runners-up',
  finalsThird: '3rd place',
  finalsFourth: '4th place',
  finalsNone:
    'No final on {date}: the source only shows matches named “Petite finale” or “Grande finale”.',

  standingsDocTitle: 'Stream source — standings',
  standingsMissingTournament:
    'Add ?tournament=<id or slug> to the URL to show the standings.',
  standingsColRank: '#',
  standingsColTeam: 'Team',
  standingsColPlayed: 'P',
  standingsColWins: 'W',
  standingsColLosses: 'L',
  standingsColDraws: 'D',
  standingsColPoints: 'Pts',
  standingsColMaps: 'Maps',
  standingsColForm: 'Form',
  standingsFormW: 'W',
  standingsFormL: 'L',
  standingsFormD: 'D',
  standingsDisqualified: 'DNF',

  scrimsDocTitle: 'Stream source — upcoming scrims',
  scrimsDateTbd: 'Date TBD',

  alertsDocTitle: 'Stream source — alert box',
  publicMvpDocTitle: 'Stream source — crowd favourite',
  publicMvpTitleOpen: 'Vote for your MVP',
  publicMvpTitleClosed: 'Crowd favourite',
  publicMvpHowTo: 'Twitch: !mvp <name> · Discord: vote menu',
  publicMvpTestBadge: 'Test',
  publicMvpWinner: 'Crowd pick',
  publicMvpNoWinner: 'Not enough votes to elect a player',
  publicMvpVotes: '{count} votes',
  publicMvpTotals: '{total} votes · {twitch} Twitch · {discord} Discord',

  partnersDocTitle: 'Stream source — partners',
  partnersHeading: 'They support us',

  scrimResultDocTitle: 'Stream source — scrim result',
  scrimResultFinal: 'Final result',
  scrimResultPending: 'Awaiting result',
  scrimResultKickoff: 'Kick-off at {time}',
  scrimResultWinner: 'Winner',
  scrimResultDraw: 'Draw',

  regieDocTitle: 'Stream source — control room (all-in-one)',
  donDocTitle: 'Stream source — donate',
  donEyebrow: 'Donate',
  donTitle: 'Support the association',
  donBody: 'Scan the QR code to donate.',
  donQrAlt: 'Donation QR code',

  donAlertDocTitle: 'Stream source — donation alert',
  donAlertEyebrow: 'New donation',
  donAlertThanks: 'Thank you for this donation!',
  donAlertAnnounce: 'Thank you for this donation of {amount}!',
  donAlertGaugeLabel: 'Donation goal',
  donAlertGaugeProgress: '{total} / {goal}',
  donAlertMissingGoal:
    'Add ?goal=<amount in euros> to the URL to show the gauge.',
  donAlertDemoBadge: 'Demo',
};
