// lib/i18n/locales/admin-en/adminTournamentVeto.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentVeto`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentVeto.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin · Map veto',
  eyebrow: 'Admin · Map veto',
  pageTitle: '{name} · Pick / Ban',
  defaultTournamentName: 'Tournament',
  linkMapDraw: 'Random draw',
  linkMapPool: 'Map pool',
  loading: 'Loading…',
  matchLabel: 'Match:',
  selectMatchPlaceholder: '— Select a match —',
  noEligibleMatch:
    'No eligible match (you need pending/ongoing matches with both teams assigned).',
  lockedTitle: 'Veto locked',
  lockedDesc: 'The match has started or is finished. No changes possible.',
  lockedAtSuffix: ' Locked on {date} (Paris).',
  unlockButton: 'Unlock',
  unlockButtonTitle: 'Exceptional action (admin only) — tracked in staff_logs.',
  stepProgress: 'Step {current} / {total}',
  clickMapPrefix: 'Click a map below to ',
  actionBan: 'ban it',
  actionPick: 'pick it',
  actionDecider: 'choose the decider',
  resetButton: 'Reset',
  lockedShort: 'Veto locked',
  completeTitle: 'Veto complete',
  completeSummary: '{count} maps picked for the {format}',
  restartButton: 'Restart',
  historyTitle: 'Veto history',
  teamShort1: 'Team 1',
  teamShort2: 'Team 2',
  mapsToPlayTitle: 'Maps to play',
  mapSlot: 'Map {n}',
  pickBy: '{team} pick',
  decider: 'Decider',
  availableMapsTitle: 'Available maps ({count})',
  mapUsedTitle: 'Map already used',
  mapUsed: 'Already used',
  team1Fallback: 'Team 1',
  team2Fallback: 'Team 2',
  sideRemaining: 'Remaining',
  typeControl: 'Control',
  typeHybrid: 'Hybrid',
  typeEscort: 'Escort',
  typePush: 'Push',
  typeFlashpoint: 'Flashpoint',
  toastVetoLockedModify: 'Veto locked: cannot modify.',
  errorLoad: 'Loading error',
  errorLoadVeto: 'Unable to load the veto',
  error: 'Error',
  errorVetoLockedStarted: 'The veto is locked (match started).',
  errorVetoAction: 'Veto error',
  toastVetoCompleteGames: 'Veto complete! Games were created automatically.',
  toastVetoComplete: 'Veto complete!',
  confirmResetTitle: 'Reset all vetoes for this match?',
  confirmResetSubtitle: 'All map picks for this match will be deleted.',
  confirmResetLabel: 'Reset',
  toastVetoReset: 'Veto reset.',
  confirmUnlockTitle: 'Unlock the veto?',
  confirmUnlockSubtitle:
    'Exceptional action: allows editing the veto again even after the match has started. All actions will be tracked in staff_logs.',
  confirmUnlockLabel: 'Unlock',
  unlockReasonPrompt: 'Reason for unlocking (optional, max 500 chars):',
  errorUnlock: 'Unlock failed',
  toastVetoUnlocked: 'Veto unlocked.',
};
