// lib/i18n/locales/admin-en/adminMatchDetail.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchDetail`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchDetail.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusPending: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  statusCancelled: 'Cancelled',
  statusDisputed: 'Disputed',
  statusWalkover: 'Walkover',
  statusPostponed: 'Postponed',
  pageTitle: 'Admin · Match {id}',
  kicker: 'Admin · Match',
  headingMatchFallback: 'Match',
  tournamentPrefix: 'Tournament:',
  edit: 'Edit',
  history: 'History',
  historyTitle: 'Staff edit history (score, status, scheduling, dispute…)',
  resolveDispute: 'Resolve the dispute',
  cancelDispute: 'Cancel the dispute',
  openDispute: 'Open a dispute',
  refresh: 'Refresh',
  loading: 'Loading…',
  disputeOngoingHeading: 'Ongoing dispute',
  disputeResolvedHeading: 'Resolved dispute',
  disputeOpenedAt: 'Opened: {date}',
  motifLabel: 'Reason',
  decisionLabel: 'Decision',
  disputeBlockedNote:
    'While this dispute is open, the score cannot be modified and bracket propagation is blocked.',
  planningHeading: 'Scheduling',
  startLabel: 'Start: {date}',
  endLabel: 'End: {date}',
  streamLabel: 'Stream:',
  formatHeading: 'Format',
  boLabel: 'BO: {value}',
  roundLabel: 'Round: {value}',
  lobbyLabel: 'Lobby: {code}',
  summaryHeading: 'Summary',
  scoreLabel: 'Score: {s1} - {s2}',
  winnerLabel: 'Winner: {name}',
  team1Fallback: 'Team 1',
  team2Fallback: 'Team 2',
  notesLabel: 'Notes: {notes}',
  mapsHeading: 'Map details',
  mapsCount: '{count} map(s)',
  mapFallback: 'Map',
  orderLabel: 'Order: {order}',
  tiebreakerPrefix: 'Tiebreaker · ',
  overtime: 'Overtime',
  regularTime: 'Regular time',
  openDisputeTitle: 'Open a dispute',
  openDisputeSubtitle:
    'The match will switch to « disputed » status. While it is, the score cannot be modified and bracket propagation is blocked.',
  cancel: 'Cancel',
  opening: 'Opening...',
  openDisputeSubmit: 'Open the dispute',
  motifModalLabel: 'Reason',
  motifPlaceholder: 'e.g. score contested by team X, screenshot provided...',
  resolveDisputeTitle: 'Resolve the dispute',
  resolveDisputeSubtitle:
    'Enter the final decision. You can correct the score if needed — bracket propagation will be re-run automatically.',
  resolving: 'Resolving...',
  applyDecision: 'Apply the decision',
  decisionModalLabel: 'Decision',
  decisionPlaceholder:
    'e.g. score corrected to 2-1, screenshot validated, etc.',
  statusAfterLabel: 'Status after resolution',
  resumeFinished: 'Finished (with score)',
  resumeWalkover: 'Walkover',
  resumeOngoing: 'Ongoing',
  resumePending: 'Upcoming',
  scoreFor: '{team} score',
  errorReasonRequired: 'Enter a reason.',
  errorOpenDispute: 'Error opening dispute',
  errorDecisionRequired: 'Enter a decision.',
  errorResolve: 'Resolution error',
  confirmCancelDispute:
    'Cancel this dispute (without a decision)? The reason will be cleared.',
  errorCancel: 'Cancellation error',
  errorMatchIdMissing: 'Match ID missing',
  errorLoad: 'Loading error',
  teamFallback: 'Team {n}',
  teamScore: 'Score: {score}',
};
