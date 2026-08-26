// lib/i18n/locales/en/adminRegie.ts
//
// Traductions ANGLAISES du namespace `adminRegie`.
//
// La SOURCE DE VERITE est le francais (`../fr/adminRegie.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  docTitle: "Control room | OW Women's Cup",
  heading: 'Control room',
  subtitle:
    'Real-time control desk: live segment, cues, briefings and checklist.',
  openDirector: 'Open the Director',
  signOut: 'Sign out',
  statusOnline: 'Online',
  statusReconnecting: 'Reconnecting…',
  statusOffline: 'Offline',
  statusSeen: 'Seen by the control room',
  endRun: 'End the run',
  ending: 'Ending…',
  endRunConfirmTitle: 'End the current run?',
  endRunConfirmBody: 'All unfinished segments will be marked as done.',
  endRunConfirmCta: 'End the run',
  endRunSuccess: 'Run ended.',
  endRunError: 'Could not end the run.',
  endSegment: 'End the segment',
  endingSegment: 'Ending segment…',
  endSegmentConfirmTitle: 'End the current segment?',
  endSegmentConfirmBody:
    'The segment will be marked as done. The desk will wait for the next segment.',
  endSegmentConfirmCta: 'End the segment',
  endSegmentSuccess: 'Segment ended.',
  endSegmentError: 'Could not end the segment.',
  startNext: 'Start the next one',
  startingNext: 'Starting…',
  startNextSuccess: 'Next segment started.',
  startNextError: 'Could not start the next segment.',
};
