// lib/i18n/locales/admin-fr/adminMatchDetail.ts
//
// Traductions FRANCAISES du namespace `adminMatchDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminMatchDetail', {
  statusPending: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  statusCancelled: 'Annulé',
  statusDisputed: 'En dispute',
  statusWalkover: 'Forfait',
  statusPostponed: 'Reporté',
  pageTitle: 'Admin · Match {id}',
  kicker: 'Admin · Match',
  headingMatchFallback: 'Match',
  tournamentPrefix: 'Tournoi :',
  edit: 'Éditer',
  history: 'Historique',
  historyTitle:
    'Historique des modifications staff (score, statut, planning, dispute…)',
  resolveDispute: 'Résoudre la dispute',
  cancelDispute: 'Annuler la dispute',
  openDispute: 'Ouvrir une dispute',
  refresh: 'Rafraîchir',
  loading: 'Chargement…',
  disputeOngoingHeading: 'Dispute en cours',
  disputeResolvedHeading: 'Dispute résolue',
  disputeOpenedAt: 'Ouverte : {date}',
  motifLabel: 'Motif',
  decisionLabel: 'Décision',
  disputeBlockedNote:
    'Tant que cette dispute est ouverte, le score ne peut pas être modifié et la propagation bracket est bloquée.',
  planningHeading: 'Planification',
  startLabel: 'Début : {date}',
  endLabel: 'Fin : {date}',
  streamLabel: 'Stream :',
  formatHeading: 'Format',
  boLabel: 'BO : {value}',
  roundLabel: 'Round : {value}',
  lobbyLabel: 'Lobby : {code}',
  summaryHeading: 'Résumé',
  scoreLabel: 'Score : {s1} - {s2}',
  winnerLabel: 'Vainqueur : {name}',
  team1Fallback: 'Équipe 1',
  team2Fallback: 'Équipe 2',
  notesLabel: 'Notes : {notes}',
  mapsHeading: 'Détails des maps',
  mapsCount: '{count} map(s)',
  mapFallback: 'Map',
  orderLabel: 'Ordre : {order}',
  tiebreakerPrefix: 'Tiebreaker · ',
  overtime: 'Overtime',
  regularTime: 'Temps regl.',
  openDisputeTitle: 'Ouvrir une dispute',
  openDisputeSubtitle:
    "Le match passera en statut « disputed ». Tant qu'il y est, le score ne peut pas être modifié et la propagation bracket est bloquée.",
  cancel: 'Annuler',
  opening: 'Ouverture...',
  openDisputeSubmit: 'Ouvrir la dispute',
  motifModalLabel: 'Motif',
  motifPlaceholder:
    "Ex : score contesté par l'équipe X, capture d'écran fournie...",
  resolveDisputeTitle: 'Résoudre la dispute',
  resolveDisputeSubtitle:
    'Saisis la décision finale. Tu peux corriger le score si nécessaire — la propagation bracket sera relancée automatiquement.',
  resolving: 'Résolution...',
  applyDecision: 'Appliquer la décision',
  decisionModalLabel: 'Décision',
  decisionPlaceholder: 'Ex : score corrigé en 2-1, screenshot validé, etc.',
  statusAfterLabel: 'Statut après résolution',
  resumeFinished: 'Terminé (avec score)',
  resumeWalkover: 'Forfait',
  resumeOngoing: 'En cours',
  resumePending: 'À venir',
  scoreFor: 'Score {team}',
  errorReasonRequired: 'Saisis une raison.',
  errorOpenDispute: 'Erreur ouverture dispute',
  errorDecisionRequired: 'Saisis une décision.',
  errorResolve: 'Erreur résolution',
  confirmCancelDispute:
    'Annuler cette dispute (sans décision) ? Le motif sera effacé.',
  errorCancel: 'Erreur annulation',
  errorMatchIdMissing: 'Match ID manquant',
  errorLoad: 'Erreur de chargement',
  teamFallback: 'Équipe {n}',
  teamScore: 'Score : {score}',
});
