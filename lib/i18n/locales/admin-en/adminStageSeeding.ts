// lib/i18n/locales/admin-en/adminStageSeeding.ts
//
// Traductions ANGLAISES du namespace admin `adminStageSeeding`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStageSeeding.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errLoad: 'Loading error',
  errFallback: 'Failed',
  toastSelectSource: 'Select a source stage.',
  toastLockedReseed: 'Re-seed blocked: a round 1 match has started.',
  confirmAutoTitle: 'Apply automatic seeding?',
  confirmAutoSubtitle:
    'This overwrites the current round 1 slots with the auto proposal.',
  confirmAutoLabel: 'Apply auto',
  toastAutoApplied: 'Automatic seeding applied.',
  toastNoAssignments: 'No assignments to apply.',
  toastDuplicateTeam: 'Duplicate team in the draft.',
  confirmManualTitle: 'Apply manual seeding?',
  confirmManualSubtitle:
    'This replaces the current round 1 slots with your manual choices.',
  confirmManualLabel: 'Apply manual',
  toastManualApplied: 'Manual seeding applied.',
  toastRatingLocked: 'Rating seed blocked: a round 1 match has started.',
  toastGenBracketFirst: "Generate this stage's bracket first before seeding.",
  confirmRatingTitle: 'Apply rating seed?',
  confirmRatingSubtitle:
    'This ranks registered teams by Glicko rating (+ SoS) and overwrites the current round 1 slots.',
  confirmRatingLabel: 'Apply rating seed',
  toastRatingApplied: '{count} teams placed.',
  toastRatingConflict:
    'Not possible: a round 1 match is already played or in progress.',
  pageTitle: 'Admin – Seeding comparator',
  back: 'Back to stage',
  heading: 'Seeding comparator',
  subtitle: '{stage} · {slots} round 1 slots',
  refresh: 'Refresh',
  lockNoticeSuffix:
    'All seeding actions are blocked until these matches are reset.',
  sourceStageLabel: 'Source stage (standings)',
  noSourceStage: '— No source stage —',
  patternLabel: 'Placement pattern',
  patternStandard: 'Standard (1 vs 2N, 2 vs 2N-1, …)',
  patternSequential: 'Sequential (1 vs 2, 3 vs 4, …)',
  copyAutoToManual: 'Copy auto → manual',
  clearDraft: 'Clear draft',
  autoTitle: 'Auto proposal',
  slotCount: '{count} slot(s)',
  matchLabel: 'Match #{n}',
  noRound1Matches: 'No round 1 matches in this bracket.',
  applying: 'Applying…',
  applyAuto: 'Apply this auto-seed',
  manualTitle: 'Manual draft',
  draftSlotCount: '{count} slot(s) filled',
  noRound1: 'No round 1 matches.',
  applyManual: 'Apply this manual draft',
  ratingTitle: 'Rating seed (Glicko + SoS)',
  ratingRankedCount: '{count} team(s) ranked',
  ratingIntroBefore:
    'Ranks registered teams by cross-event Glicko rating (+ strength of schedule), with no qualifying stage. First run a',
  ratingIntroLink: 'ratings rebuild',
  ratingIntroAfter: 'if the ranking looks empty or neutral.',
  methodLabel: 'Method',
  methodRatingSos: 'Rating + SoS',
  methodRating: 'Rating only',
  sosWeightLabel: 'SoS weight',
  sosWeightHint: '(advanced, empty = default)',
  sosWeightPlaceholder: 'server default',
  ratingLockReason: 'Seeding blocked: a round 1 match has started.',
  ratingNoBracketNotice:
    "No round 1 match: generate this stage's bracket first.",
  loadingShort: 'Loading…',
  ratingEmptyBefore: 'No teams registered for this stage. Add teams from',
  ratingEmptyLink: "the stage's Teams tab",
  thRank: 'Rank',
  thTeam: 'Team',
  thRating: 'Rating',
  thSos: 'SoS',
  thScore: 'Score',
  applyRating: 'Apply rating seed',
  slotEmpty: '— empty —',
  teamUnknown: '— unknown team —',
  provisionalTitle: 'High Glicko RD / few matches: provisional ranking.',
  provisionalBadge: 'provisional',
};
