// lib/i18n/locales/admin-fr/adminDashboardDisputeResolveModal.ts
//
// Traductions FRANCAISES du namespace `adminDashboardDisputeResolveModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDashboardDisputeResolveModal', {
  resolutionRequired: 'La résolution est requise.',
  scoresInteger: 'Les deux scores doivent être des entiers ≥ 0.',
  offline: 'Hors-ligne : la résolution sera envoyée à la reconnexion.',
  unexpectedError: 'Erreur inattendue',
  title: 'Résoudre la dispute',
  closeAria: 'Fermer',
  reasonLabel: 'Raison de la dispute',
  modeNoChange: 'Sans changer le score',
  modeOverride: 'Avec score corrigé',
  team1Fallback: 'Équipe 1',
  team2Fallback: 'Équipe 2',
  resolutionLabel: "Résolution (visible dans l'historique)",
  resolutionPlaceholder:
    'Ex : après vérification du replay, le score initial était correct.',
  resumeStatusLabel: 'Statut de reprise',
  resumeFinished: 'Terminé (finished)',
  resumeOngoing: 'En cours (ongoing)',
  resumePending: 'En attente (pending)',
  cancel: 'Annuler',
  resolve: 'Résoudre',
  evidenceHeading: 'Preuves attachées',
  evidenceRefresh: 'Rafraîchir',
  evidenceLoading: 'Chargement des preuves…',
  evidenceError: 'Impossible de charger les preuves.',
  evidenceEmpty: 'Aucune preuve attachée',
  evidenceCount: '{count} élément(s)',
  evidenceSide1: 'Équipe 1',
  evidenceSide2: 'Équipe 2',
  evidenceSideStaff: 'Staff (neutre)',
  evidenceKindScreenshot: "Capture d'écran",
  evidenceKindReplayFile: 'Fichier replay',
  evidenceKindReplayUrl: 'Lien replay',
  evidenceOpen: 'Télécharger / ouvrir',
  evidenceImgAlt: 'Aperçu de la preuve soumise par {side}',
  evidenceAddHeading: 'Ajouter une preuve neutre (staff)',
  evidenceAddFile: 'Fichier (capture ou replay)',
  evidenceOr: 'ou',
  evidenceAddUrl: 'Lien replay (URL)',
  evidenceAddUrlPlaceholder: 'https://… (lien replay)',
  evidenceAddUrlButton: 'Ajouter le lien',
  evidenceNoteLabel: 'Note (optionnelle)',
  evidenceNotePlaceholder: "Note / contexte pour l'arbitrage (optionnel)…",
  evidenceUrlRequired: 'Renseignez une URL de replay.',
  evidenceAddError: "Échec de l'ajout de la preuve.",
  evidenceAdded: 'Preuve ajoutée.',
});
