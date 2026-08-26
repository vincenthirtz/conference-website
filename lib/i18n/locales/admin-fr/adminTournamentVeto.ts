// lib/i18n/locales/admin-fr/adminTournamentVeto.ts
//
// Traductions FRANCAISES du namespace `adminTournamentVeto` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentVeto', {
  headTitle: 'Admin · Veto de maps',
  eyebrow: 'Admin · Veto de maps',
  pageTitle: '{name} · Pick / Ban',
  defaultTournamentName: 'Tournoi',
  linkMapDraw: 'Tirage aléatoire',
  linkMapPool: 'Pool de maps',
  loading: 'Chargement…',
  matchLabel: 'Match :',
  selectMatchPlaceholder: '— Sélectionner un match —',
  noEligibleMatch:
    'Aucun match éligible (il faut des matchs pending/ongoing avec les deux équipes assignées).',
  lockedTitle: 'Veto verrouillé',
  lockedDesc:
    'Le match a commencé ou est terminé. Aucune modification possible.',
  lockedAtSuffix: ' Verrouillé le {date} (Paris).',
  unlockButton: 'Déverrouiller',
  unlockButtonTitle:
    'Action exceptionnelle (admin only) — tracée dans staff_logs.',
  stepProgress: 'Étape {current} / {total}',
  clickMapPrefix: 'Cliquez sur une map ci-dessous pour ',
  actionBan: 'la bannir',
  actionPick: 'la sélectionner',
  actionDecider: 'choisir le decider',
  resetButton: 'Réinitialiser',
  lockedShort: 'Veto verrouillé',
  completeTitle: 'Veto terminé',
  completeSummary: '{count} maps sélectionnées pour le {format}',
  restartButton: 'Recommencer',
  historyTitle: 'Historique du veto',
  teamShort1: 'Éq. 1',
  teamShort2: 'Éq. 2',
  mapsToPlayTitle: 'Maps à jouer',
  mapSlot: 'Map {n}',
  pickBy: 'Pick {team}',
  decider: 'Decider',
  availableMapsTitle: 'Maps disponibles ({count})',
  mapUsedTitle: 'Map déjà utilisée',
  mapUsed: 'Déjà utilisée',
  team1Fallback: 'Équipe 1',
  team2Fallback: 'Équipe 2',
  sideRemaining: 'Restante',
  typeControl: 'Contrôle',
  typeHybrid: 'Hybride',
  typeEscort: 'Convoi',
  typePush: 'Push',
  typeFlashpoint: 'Flashpoint',
  toastVetoLockedModify: 'Veto verrouillé : impossible de modifier.',
  errorLoad: 'Erreur de chargement',
  errorLoadVeto: 'Impossible de charger le veto',
  error: 'Erreur',
  errorVetoLockedStarted: 'Le veto est verrouillé (match commencé).',
  errorVetoAction: 'Erreur lors du veto',
  toastVetoCompleteGames:
    'Veto terminé ! Les games ont été créées automatiquement.',
  toastVetoComplete: 'Veto terminé !',
  confirmResetTitle: 'Reinitialiser tous les vetos de ce match ?',
  confirmResetSubtitle:
    'Toutes les selections de map de ce match vont etre supprimees.',
  confirmResetLabel: 'Reinitialiser',
  toastVetoReset: 'Veto réinitialisé.',
  confirmUnlockTitle: 'Déverrouiller le veto ?',
  confirmUnlockSubtitle:
    'Action exceptionnelle : permet de remodifier le veto même après le début du match. Toutes les actions seront tracées dans staff_logs.',
  confirmUnlockLabel: 'Déverrouiller',
  unlockReasonPrompt: 'Raison du déverrouillage (optionnel, max 500 chars) :',
  errorUnlock: 'Échec du déverrouillage',
  toastVetoUnlocked: 'Veto déverrouillé.',
});
