// lib/i18n/locales/admin-en/adminDashboardDisputeResolveModal.ts
//
// Traductions ANGLAISES du namespace admin `adminDashboardDisputeResolveModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDashboardDisputeResolveModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  resolutionRequired: 'Resolution is required.',
  scoresInteger: 'Both scores must be integers ≥ 0.',
  offline: 'Offline: the resolution will be sent on reconnection.',
  unexpectedError: 'Unexpected error',
  title: 'Resolve the dispute',
  closeAria: 'Close',
  reasonLabel: 'Dispute reason',
  modeNoChange: 'Without changing the score',
  modeOverride: 'With corrected score',
  team1Fallback: 'Team 1',
  team2Fallback: 'Team 2',
  resolutionLabel: 'Resolution (visible in history)',
  resolutionPlaceholder:
    'E.g.: after reviewing the replay, the initial score was correct.',
  resumeStatusLabel: 'Resume status',
  resumeFinished: 'Finished',
  resumeOngoing: 'Ongoing',
  resumePending: 'Pending',
  cancel: 'Cancel',
  resolve: 'Resolve',
  evidenceHeading: 'Attached evidence',
  evidenceRefresh: 'Refresh',
  evidenceLoading: 'Loading evidence…',
  evidenceError: 'Could not load evidence.',
  evidenceEmpty: 'No evidence attached',
  evidenceCount: '{count} item(s)',
  evidenceSide1: 'Team 1',
  evidenceSide2: 'Team 2',
  evidenceSideStaff: 'Staff (neutral)',
  evidenceKindScreenshot: 'Screenshot',
  evidenceKindReplayFile: 'Replay file',
  evidenceKindReplayUrl: 'Replay link',
  evidenceOpen: 'Download / open',
  evidenceImgAlt: 'Preview of the evidence submitted by {side}',
  evidenceAddHeading: 'Add neutral evidence (staff)',
  evidenceAddFile: 'File (screenshot or replay)',
  evidenceOr: 'or',
  evidenceAddUrl: 'Replay link (URL)',
  evidenceAddUrlPlaceholder: 'https://… (replay link)',
  evidenceAddUrlButton: 'Add link',
  evidenceNoteLabel: 'Note (optional)',
  evidenceNotePlaceholder: 'Note / context for arbitration (optional)…',
  evidenceUrlRequired: 'Please enter a replay URL.',
  evidenceAddError: 'Failed to add the evidence.',
  evidenceAdded: 'Evidence added.',
};
