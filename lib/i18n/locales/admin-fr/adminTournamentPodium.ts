// lib/i18n/locales/admin-fr/adminTournamentPodium.ts
//
// Traductions FRANCAISES du namespace `adminTournamentPodium` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentPodium', {
  pageTitle: 'Admin – Podium {name}',
  backToTournament: 'Retour au tournoi',
  heading: 'Podium & clôture',
  introBefore: 'Fige le classement final et passe le tournoi en ',
  introStatusDone: 'Terminé',
  introAfter:
    ". Les rangs doivent être consécutifs à partir de 1 (pas de trous, pas d'ex-aequo en V1).",
  publicPreview: 'Aperçu public ↗',
  refresh: 'Rafraîchir',
  loading: 'Chargement…',
  tournamentStatus: 'Statut du tournoi :',
  lastStage: 'Dernière phase :',
  podiumFrozen: 'Podium gelé',
  frozenNoticeBefore: 'Le podium est figé. Pour le modifier, active ',
  forceMode: 'Mode écrasement (force)',
  frozenNoticeAfter: ". L'action sera tracée dans staff_logs.",
  forceModeBanner:
    'Mode écrasement activé. Les anciens rangs seront remplacés.',
  cancel: 'Annuler',
  notRunningBefore: "Le tournoi n'est pas en cours (statut ",
  notRunningMiddle: '). Passe le en ',
  notRunningAfter: " depuis la page d'édition avant de finaliser.",
  autofillFromProposed: 'Pré-remplir depuis la proposition',
  clearRanks: 'Vider les rangs',
  teamCount: '{count} équipe(s)',
  colRank: 'Rang',
  colTeam: 'Équipe',
  colSource: 'Source',
  colPrize: 'Prix',
  colNotes: 'Notes',
  sourceBracketFinal: 'Bracket – finale',
  sourceBracketSemi: 'Bracket – ½',
  prizePlaceholder: 'ex: 1500€',
  previewLabel: 'Aperçu : ',
  submitting: 'Finalisation…',
  overwriteRefreeze: 'Écraser & regeler',
  finalizeTournament: 'Finaliser le tournoi',
  confirmOverwriteTitle: 'Écraser le podium ?',
  confirmFinalizeTitle: 'Finaliser le tournoi ?',
  confirmOverwriteSubtitle:
    'Cela va remplacer le podium déjà figé. Cette action est tracée dans les logs staff.',
  confirmFinalizeSubtitle:
    'Cela va figer le podium et passer le tournoi en "Terminé". L\'opération est idempotente mais visible publiquement.',
  confirmOverwriteLabel: 'Écraser',
  confirmFinalizeLabel: 'Finaliser',
  errorLoad: 'Erreur de chargement',
  errorNoRank: 'Aucun rang renseigné.',
  errorRankDuplicate: 'Rang {rank} en double.',
  errorRanksConsecutive:
    'Les rangs doivent être consécutifs 1..N (manque {n}).',
  toastOverwritten: 'Podium écrasé et regelé.',
  toastFinalized: 'Tournoi finalisé.',
  errorGeneric: 'Échec',
  statusDraft: 'Brouillon',
  statusPublished: 'Publié',
  statusRunning: 'En cours',
  statusCompleted: 'Terminé',
  statusArchived: 'Archivé',
  statusCancelled: 'Annulé',
});
