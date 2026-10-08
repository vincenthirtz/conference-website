// lib/i18n/locales/admin-en/adminStageTeams.ts
//
// Traductions ANGLAISES du namespace admin `adminStageTeams`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStageTeams.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errUnexpected: 'Unexpected error',
  errSelectTeam: 'Please select a team to add.',
  toastAdded: 'Team added to the stage.',
  errAdd: 'Unexpected error while adding',
  toastRemoved: 'Team removed from the stage.',
  errRemove: 'Unexpected error while removing',
  toastSeedUpdated: 'Seed updated.',
  errSeedUpdate: 'Unexpected error while updating the seed',
  toastBulkSeed_one: 'Seeds updated for {count} team.',
  toastBulkSeed_other: 'Seeds updated for {count} teams.',
  errBulkSeed: 'Unexpected error during bulk seed',
  confirmBulkRemove_one: 'Remove {count} team from this stage?',
  confirmBulkRemove_other: 'Remove {count} teams from this stage?',
  toastBulkRemoved_one: '{count} team removed from the stage.',
  toastBulkRemoved_other: '{count} teams removed from the stage.',
  errBulkRemove: 'Unexpected error during bulk removal',
  pageTitle: 'Admin – Stage teams',
  back: '← Back to stage',
  heading: 'Stage teams',
  subtitle: 'Manage the teams attached to this stage: add, remove, seeds…',
  loadingTeams: 'Loading stage teams…',
  phaseLabel: 'Stage',
  tournamentPrefix: 'Tournament:',
  teamsInPhaseLabel: 'Teams in the stage:',
  addTeamTitle: 'Add a team to this stage',
  teamSelectLabel: 'Team (tournament)',
  loadingShort: 'Loading…',
  selectTeam: 'Select a team',
  seedOptionalLabel: 'Seed (optional)',
  adding: 'Adding…',
  addTeamSubmit: 'Add team',
  allTeamsAttached: 'All tournament teams are already attached to this stage.',
  attachedTeamsTitle: 'Teams attached to the stage',
  teamCount_one: '{count} team',
  teamCount_other: '{count} teams',
  autoSeedTitle: 'Automatically number 1, 2, 3… in the current order',
  autoSeed: 'Auto-seed 1..N',
  bulkSeedSaving: 'Saving…',
  bulkSeedSave: 'Save all seeds',
  bulkRemoving: 'Removing…',
  bulkRemove_one: 'Remove {count} team',
  bulkRemove_other: 'Remove {count} teams',
  emptyTeams: 'No team is attached to this stage yet.',
  thSeed: 'Seed',
  thTeam: 'Team',
  thNotes: 'Notes',
  thActions: 'Actions',
  seedOkSaving: 'OK…',
  seedOk: 'OK',
  viewTeam: 'View team',
  removing: 'Removing…',
  remove: 'Remove',
  stageNotFound: 'Stage not found.',

  // --- Disqualification -----------------------------------------------
  disqualify: 'Disqualify',
  reinstate: 'Reinstate',
  dqBadge: 'DNF',
  dqModeForfeitShort: 'Remaining matches lost by forfeit',
  dqModeAnnulShort: 'All results voided',
  dqBadgeTitle: 'Disqualified — {mode}',
  dqBadgeTitleReason: 'Disqualified — {mode}. Reason: {reason}',
  dqModalTitle: 'Disqualify {team}',
  dqModalIntro:
    'The team will be ranked last in this stage with a “DNF” badge, and can no longer qualify. Choose what happens to its matches:',
  dqModeLegend: 'What happens to its matches?',
  dqModeForfeitTitle: 'Keep played matches',
  dqModeForfeitDesc:
    'Matches already played keep their result. Its remaining matches are declared lost by forfeit: the opponent wins (2-0 in a Bo3, and so on). Predictions on those matches are voided.',
  dqModeAnnulTitle: 'Void all its results',
  dqModeAnnulDesc:
    'None of its matches count towards the standings any more, for anyone: played matches stay in the history but are ignored, and its remaining matches are cancelled. Coins and predictions already paid out on played matches are not clawed back.',
  dqReasonLabel: 'Reason (required)',
  dqReasonPlaceholder:
    'e.g. confirmed cheating, withdrawal announced on Discord, ineligible player…',
  dqReasonHelp: 'Between 3 and 500 characters. Shown in the staff log.',
  dqSummaryPick: 'Pick an option to see what will happen.',
  dqSummaryForfeit:
    '{team} will be ranked last; its remaining matches will be lost by forfeit.',
  dqSummaryAnnul:
    '{team} will be ranked last; its remaining matches will be cancelled and none of its results will count any more.',
  dqSummaryCaveat:
    'Disputed matches are left untouched and will need handling by hand. Reinstating the team later will not restore its matches.',
  dqCancel: 'Cancel',
  dqConfirm: 'Disqualify',
  dqSubmitting: 'Disqualifying…',
  dqToastForfeit_one: '{team} disqualified: {count} match lost by forfeit.',
  dqToastForfeit_other: '{team} disqualified: {count} matches lost by forfeit.',
  dqToastAnnul_one: '{team} disqualified: {count} match cancelled.',
  dqToastAnnul_other: '{team} disqualified: {count} matches cancelled.',
  dqErr: 'Disqualification failed.',
  dqErrAlready: 'This team is already disqualified from the stage.',
  dqErrCompleted:
    'The tournament is completed: reopen it before disqualifying a team.',
  dqErrNotInStage: 'This team is no longer in the stage.',
  dqReportTitle: '{team} is disqualified, but some matches still need handling',
  dqReportIntro:
    'These matches were left unchanged. Open them to sort them out by hand:',
  dqReportIncomplete:
    'Processing stopped on an error: the following matches were not processed.',
  dqSkipDisputed: 'disputed',
  dqSkipNoOpponent: 'no opponent',
  dqSkipStatusChanged: 'status changed in the meantime',
  dqFailed: 'failed: {error}',
  dqNotProcessed: 'not processed',
  dqOpenMatch: 'Open match {id}',
  dqMatchVs: '{team1} vs {team2}',
  dqMatchTbd: 'TBD',
  dqReportDismiss: 'Dismiss',
  rsConfirmTitle: 'Reinstate {team}?',
  rsConfirmSubtitle:
    'The team gets its normal place back in the standings and can qualify again. Its forfeited or cancelled matches are NOT restored: fix them by hand if needed.',
  rsToast: '{team} reinstated.',
  rsToastNotRestored_one:
    '{team} reinstated. {count} match is still forfeited or cancelled: fix it by hand if needed.',
  rsToastNotRestored_other:
    '{team} reinstated. {count} matches are still forfeited or cancelled: fix them by hand if needed.',
  rsErr: 'Reinstatement failed.',
  rsErrNotDisqualified: 'This team is not disqualified from the stage.',
};
