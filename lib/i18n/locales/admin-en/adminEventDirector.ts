// lib/i18n/locales/admin-en/adminEventDirector.ts
//
// Traductions ANGLAISES du namespace admin `adminEventDirector`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminEventDirector.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorLoad: 'Loading error.',
  autoCueFailed: 'Auto-cue failed ({status}).',
  startFailedStatus: 'Start failed ({status}).',
  runAlreadyLive: 'The run was already live.',
  runStarted: 'Run started.',
  startFailed: 'Start failed.',
  confirmEndRunTitle: 'End this run?',
  confirmEndRunSubtitle:
    'All unfinished segments will switch to « done ». This action is irreversible.',
  confirmEndRunLabel: 'End',
  endFailedStatus: 'End failed ({status}).',
  runAlreadyEnded: 'The run was already ended.',
  runEnded: 'Run ended.',
  endFailed: 'End failed.',
  segmentAlreadyLive: 'Already live.',
  segmentStarted: 'Segment started.',
  confirmSkipTitle: 'Skip « {title} »?',
  confirmSkipSubtitle:
    "The segment will be marked « skipped » and won't be played. Irreversible action.",
  confirmSkipLabel: 'Skip',
  skipFailedStatus: 'Skip failed ({status}).',
  segmentSkipped: 'Segment skipped.',
  skipFailed: 'Skip failed.',
  segmentEnded: 'Segment ended.',
  confirmDeleteSegTitle: 'Delete « {title} »?',
  confirmDeleteSegSubtitle: 'The segment will be permanently deleted.',
  confirmDeleteLabel: 'Delete',
  deleteFailedStatus: 'Delete failed ({status}).',
  segmentDeleted: 'Segment deleted.',
  deleteFailed: 'Delete failed.',
  reorderFailed: 'Reorder failed, restoring.',
  reorderConflict:
    'The order was changed by another director — display realigned.',
  errorRunNotFound: 'Run not found.',
  segmentAdded: 'Segment added.',
  errorNoSegment: 'No segment selected.',
  segmentSaved: 'Segment saved.',
  assignmentUpdated: 'Assignment updated.',
  waveCreated: 'Wave created.',
  createFailed: 'Creation failed.',
  waveUpdated: 'Wave updated.',
  updateFailed: 'Update failed.',
  confirmSkipWaveTitle: 'Skip the wave « {title} »?',
  confirmSkipWaveSubtitle: 'The wave will be marked « skipped ».',
  skipWaveLabel: 'Skip',
  waveStatusUpdated: 'Wave status updated.',
  statusChangeFailed: 'Change failed.',
  confirmDeleteWaveTitle: 'Delete the wave « {title} »?',
  confirmDeleteWaveSubtitle:
    "The attached segments won't be deleted but will be detached from the wave.",
  waveDeleted: 'Wave deleted.',
  stationCreated: 'Station created.',
  stationUpdated: 'Station updated.',
  confirmDeleteStationTitle: 'Delete the station « {name} »?',
  confirmDeleteStationSubtitle:
    "The attached segments won't be deleted but will be detached from the station.",
  stationDeleted: 'Station deleted.',
  pageTitleWithRun: 'Director – {name} · Run of show',
  pageTitleNoRun: 'Director – Run of show',
  breadcrumbAdmin: 'Admin',
  breadcrumbRunOfShow: 'Run of show',
  breadcrumbDirectorFallback: 'Director',
  loading: 'Loading…',
  eventNotFound: 'Event not found.',
  timelineHeading: 'Timeline',
  dragToReorder: 'Drag to reorder',
  editionHeading: 'Editing',
  castersHeading: 'Casters',
  commsHeading: 'Comms',
  wavesStationsHeading: 'Waves & Stations',
  conflictsHeading: 'Schedule conflicts',
  conflictsSubtitle:
    'A team is scheduled on overlapping matches. Review the schedule before going live.',
  conflictLine: ': "{matchA}" overlaps "{matchB}"',
  conflictOverlap: 'overlap {start} – {end}',
  conflictUnknownTeam: 'Unknown team',
  realtimeConnected: 'Real-time',
  realtimeDegraded: 'Reconnecting… (degraded mode)',
};
