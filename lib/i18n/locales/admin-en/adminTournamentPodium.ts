// lib/i18n/locales/admin-en/adminTournamentPodium.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentPodium`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentPodium.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Podium {name}',
  backToTournament: 'Back to tournament',
  heading: 'Podium & closing',
  introBefore: 'Freeze the final standings and switch the tournament to ',
  introStatusDone: 'Completed',
  introAfter:
    '. Ranks must be consecutive starting from 1 (no gaps, no ties in V1).',
  publicPreview: 'Public preview ↗',
  refresh: 'Refresh',
  loading: 'Loading…',
  tournamentStatus: 'Tournament status:',
  lastStage: 'Last stage:',
  podiumFrozen: 'Podium frozen',
  frozenNoticeBefore: 'The podium is frozen. To change it, enable ',
  forceMode: 'Overwrite mode (force)',
  frozenNoticeAfter: '. The action will be logged in staff_logs.',
  forceModeBanner:
    'Overwrite mode enabled. The previous ranks will be replaced.',
  cancel: 'Cancel',
  notRunningBefore: "The tournament isn't running (status ",
  notRunningMiddle: '). Switch it to ',
  notRunningAfter: ' from the edit page before finalizing.',
  autofillFromProposed: 'Pre-fill from proposal',
  clearRanks: 'Clear ranks',
  teamCount: '{count} team(s)',
  colRank: 'Rank',
  colTeam: 'Team',
  colSource: 'Source',
  colPrize: 'Prize',
  colNotes: 'Notes',
  sourceBracketFinal: 'Bracket – final',
  sourceBracketSemi: 'Bracket – ½',
  prizePlaceholder: 'e.g. €1500',
  previewLabel: 'Preview: ',
  submitting: 'Finalizing…',
  overwriteRefreeze: 'Overwrite & refreeze',
  finalizeTournament: 'Finalize tournament',
  confirmOverwriteTitle: 'Overwrite the podium?',
  confirmFinalizeTitle: 'Finalize the tournament?',
  confirmOverwriteSubtitle:
    'This will replace the already-frozen podium. This action is logged in the staff logs.',
  confirmFinalizeSubtitle:
    'This will freeze the podium and switch the tournament to "Completed". The operation is idempotent but publicly visible.',
  confirmOverwriteLabel: 'Overwrite',
  confirmFinalizeLabel: 'Finalize',
  errorLoad: 'Loading error',
  errorNoRank: 'No rank entered.',
  errorRankDuplicate: 'Rank {rank} duplicated.',
  errorRanksConsecutive: 'Ranks must be consecutive 1..N (missing {n}).',
  toastOverwritten: 'Podium overwritten and refrozen.',
  toastFinalized: 'Tournament finalized.',
  errorGeneric: 'Failed',
  statusDraft: 'Draft',
  statusPublished: 'Published',
  statusRunning: 'Running',
  statusCompleted: 'Completed',
  statusArchived: 'Archived',
  statusCancelled: 'Cancelled',
};
