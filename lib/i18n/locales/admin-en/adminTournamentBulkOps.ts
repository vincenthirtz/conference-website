// lib/i18n/locales/admin-en/adminTournamentBulkOps.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentBulkOps`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentBulkOps.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin · Bulk operations',
  breadcrumbTournaments: 'Tournaments',
  defaultTournamentName: 'Tournament',
  breadcrumbBulkOps: 'Bulk operations',
  eyebrow: 'Admin · Bulk',
  pageTitle: 'Bulk operations',
  pageSubtitle: 'Shift a whole round or move matches between stages.',
  backToMatches: '← Match list',
  loading: 'Loading…',
  shiftTitle: 'Shift a round',
  shiftDesc:
    'Applies an offset (in minutes) to all scheduled matches in the selected round. Matches without a time or cancelled ones are skipped.',
  stageLabel: 'Stage',
  selectPlaceholder: '— Select —',
  roundLabel: 'Round',
  roundOption: 'Round {n} ({count} match)',
  offsetLabel: 'Offset in minutes (negative = earlier)',
  shifting: 'Shifting…',
  applyShift: 'Apply shift',
  reassignTitle: 'Reassign matches to another stage',
  reassignDesc:
    'Matches with active bracket links or in dispute are rejected. The group_key is reset after the move.',
  sourceStageLabel: 'Source stage',
  targetStageLabel: 'Target stage',
  matchesSelectedSummary: '{count} match(es) — {selected} selected',
  selectAll: 'Select all',
  selectNone: 'Deselect all',
  emptyStageMatches: 'No matches in this stage.',
  targetSummary: 'Target: {name}',
  moving: 'Moving…',
  moveButton: 'Move {count} match(es)',
  errorLoad: 'Loading error',
  errorGeneric: 'Error',
  toastSelectRound: 'Select a round',
  toastInvalidOffset: 'Invalid offset (integer ≠ 0)',
  confirmShift:
    'Shift this round by {offset} minutes? Matches without a time will be skipped.',
  toastShifted: '{shifted} match(es) shifted ({ignored} skipped)',
  toastSelectTarget: 'Select a target stage',
  toastSelectAtLeastOne: 'Select at least one match',
  toastSameStage: 'Source and target stages must be different',
  confirmReassign:
    'Move {count} match(es) to the target stage? The group_key will be reset.',
  toastMoved: '{count} match(es) moved',
  toastMovedSkipped: '. Skipped: {reasons}',
};
