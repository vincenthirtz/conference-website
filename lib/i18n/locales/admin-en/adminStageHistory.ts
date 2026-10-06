// lib/i18n/locales/admin-en/adminStageHistory.ts
//
// Traductions ANGLAISES du namespace admin `adminStageHistory`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStageHistory.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errLoadHistory: 'Unable to load history',
  errUnknown: 'Unknown error',
  pageTitle: 'Admin – Stage history',
  back: '← Back to stage',
  heading: 'Stage staff history',
  subtitle:
    'Log of staff actions related to this stage (stages, matches, etc.).',
  entityTypeLabel: 'Entity type (entity_type)',
  entityTypePlaceholder: 'e.g. "stage", "match", "team"...',
  actionLabel: 'Action',
  actionPlaceholder: 'e.g. "create_match", "update_stage"...',
  limitLabel: 'Limit',
  filter: 'Filter',
  loading: 'Loading...',
  logsCount: 'Logs ({count})',
  sortedHint: 'Sorted from newest to oldest',
  emptyLogs: 'No logs found for these filters.',
  by: 'by',
  payloadDetails: 'Details (payload)',
  openMatch: 'Open match',
  openStage: 'Open stage',
  openTeam: 'Open team',
  openTournament: 'Open tournament',
  tabJournal: 'Log',
  tabSnapshots: 'Snapshots',
  snapHeading: 'Bracket snapshots',
  snapIntro:
    'A capture of the scores, statuses and winners of every match in the stage. Restoring puts the matches back in that state; a "before restore" snapshot is taken automatically right before.',
  snapReasonLabel: 'Reason (optional)',
  snapReasonPlaceholder: 'e.g. before fixing round 2',
  snapTake: 'Take a snapshot',
  snapTaking: 'Snapshot…',
  snapTaken: 'Snapshot taken ({count} match(es)).',
  snapErrTake: 'Failed to create the snapshot.',
  snapErrLoad: 'Unable to load snapshots.',
  snapEmpty: 'No snapshot for this stage.',
  snapCount: '{count} snapshot(s)',
  snapMatches: '{count} match(es)',
  snapRestore: 'Restore',
  snapRestoreAdminOnly: 'Admins only',
  snapRestoreTitle: 'Restore this snapshot?',
  snapRestoreSubtitle:
    'Match scores, statuses and winners will go back to their state of {date}. Anything entered since will be overwritten (a "before restore" snapshot lets you undo).',
  snapRestoreConfirm: 'Restore',
  snapRestored:
    'Snapshot restored: {restored} match(es) reset, {missing} missing.',
  snapErrRestore: 'Restore failed.',
  snapReasonManual: 'Manual',
  snapReasonPreRestore: 'Before restore',
  snapReasonApplyScore: 'Score entry',
  snapReasonAutoSeed: 'Automatic seeding',
  snapReasonManualSeed: 'Manual seeding',
  snapReasonAdvance: 'Team advancement',
  snapReasonPropagation: 'Bracket propagation',
};
