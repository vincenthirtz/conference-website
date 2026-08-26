// lib/i18n/locales/admin-en/adminBroadcastLive.ts
//
// Traductions ANGLAISES du namespace admin `adminBroadcastLive`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminBroadcastLive.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Live broadcast',
  heading: 'Live broadcast',
  subtitle:
    'Unified cockpit: current segment, casters, stream, overlays. Poll {seconds}s.',
  director: 'Director ↗',
  refresh: 'Refresh',
  errorLoad: 'Loading error',
  loading: 'Loading…',
  noRunPrefix: 'No event_run in status',
  noRunSuffix: 'for this tenant. Start a run from the Director.',
  onAir: 'On-air',
  live: '🔴 LIVE',
  off: 'OFF',
  runLabel: 'Run:',
  segmentHeading: 'Current segment',
  segmentType: 'Type {type} · {min} min planned',
  segmentNone: 'No live segment (transition or break).',
  matchHeading: 'Match',
  stream: 'Stream ↗',
  noStream: 'No stream URL',
  segmentNonMatch: 'Non-match segment',
  castersHeading: 'Assigned casters',
  castersEmpty: 'No casters on this match.',
  casterNoName: '— unnamed —',
  overlaysHeading: 'Overlays',
  goOffAir: 'Go OFF AIR',
  goOnAir: 'Go ON AIR',
  pipEnabled: 'PiP enabled',
  lowerThirdLabel: 'Lower-third (text shown at bottom of screen)',
  lowerThirdPlaceholder: 'e.g. Semi-final — Alpha vs Bravo',
  push: 'Push',
  clear: 'Clear',
  currentOnScreen: 'Currently on screen:',
  readOnly: 'Read-only mode (caster role). Ask a manager to change the state.',
  stateUpdated: 'State updated.',
  autoHeading: 'Broadcast automation',
  autoDirectorLabel: 'Auto-director',
  autoDirectorOnHint:
    'On: scenes switch on their own on match events (match starts → "Match" scene, match ends → "Results").',
  autoDirectorOffHint: 'Off: you drive the scenes manually below.',
  sceneLabel: 'Active scene',
  sceneStarting: 'Starting soon',
  sceneMatch: 'Match',
  scenePause: 'Break',
  sceneResults: 'Results',
  sceneEnd: 'End',
  sceneCustom: 'Custom',
  sceneHint:
    'A manual pick sticks until the next auto event or another manual pick.',
  nextMatch: 'Go to next match',
  nextMatchLoading: 'Advancing…',
  nextMatchHint:
    'Advances the live run to the next match-type segment and resets the scene to "Starting soon".',
  nextMatchSuccess: 'Now live: {title}',
  nextMatchAlready: 'Already live: {title}',
  nextMatchNoLiveRun: 'No live run.',
  nextMatchNoCurrentSegment: 'No current segment on the run.',
  nextMatchNoNextMatch: 'No next match in the timeline.',
  nextMatchSegmentNotUpcoming:
    'The segment is no longer upcoming (already started or done). Refresh.',
  overlayUrlHeading: 'OBS overlay',
  overlayUrlHint: 'Add this URL as a Browser Source in OBS.',
  overlayCopy: 'Copy',
  overlayCopied: 'Overlay URL copied.',
  overlayCopyFailed: 'Could not copy the URL.',
  confirmNextTitle: 'End {current} and switch to {next}?',
  confirmNextTitleNoTarget: 'End {current} and close the run?',
  confirmNextSubtitle:
    'The live segment will be closed (irreversible) and the next match will go on air.',
  confirmNextSubtitleNoTarget:
    'The live segment will be closed (irreversible). No next match was identified in the timeline.',
  confirmNextLabel: 'Switch match',
  realtimeConnected: 'Real-time',
  realtimeDegraded: 'Reconnecting… (degraded mode)',
  failure: 'Failed',
  twitchHeading: 'Twitch status',
  twitchLoading: 'Loading Twitch status…',
  twitchLive: '🔴 LIVE',
  twitchOffline: 'Offline',
  twitchViewers: '{count} viewers',
  twitchNotConfigured: 'Twitch not configured.',
  twitchCollapse: 'Collapse',
  twitchExpand: 'Expand',
  twitchPreviewTitle: 'Twitch preview of {channel}',
  twitchChatTitle: 'Twitch chat of {channel}',
  twitchOfflinePlayer: 'Offline — no preview available.',
};
