// lib/i18n/locales/en/liveSegmentBlock.ts
//
// Traductions ANGLAISES du namespace `liveSegmentBlock`.
//
// La SOURCE DE VERITE est le francais (`../fr/liveSegmentBlock.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusUpcoming: 'Upcoming',
  statusLive: 'LIVE',
  statusDone: 'Done',
  statusSkipped: 'Skipped',
  typeMatch: 'Match',
  typeBreak: 'Break',
  typeIntro: 'Intro',
  typeOutro: 'Outro',
  typeCustom: 'Segment',
  startsNow: 'Starts now',
  startsIn: 'Starts in',
  noEventTitle: 'No event running',
  noEventBody:
    'No event_run is currently live on this tenant. Your next assignments are shown below.',
  liveBadge: 'Live',
  waitingNextSegment: 'Waiting for the next segment',
  nextLabel: 'Next:',
  minSuffix: ' • {min} min',
  timerRemaining: 'Remaining',
  timerOverrun: 'Overrun',
  timerNoDuration: 'No duration set',
  elapsed: 'Elapsed',
  nextShort: 'Next:',
  segmentFallback: 'Segment',
};
