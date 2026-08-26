// lib/i18n/locales/admin-fr/adminDashboardScoreEntryModal.ts
//
// Traductions FRANCAISES du namespace `adminDashboardScoreEntryModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDashboardScoreEntryModal', {
  scoresInteger: 'Les deux scores doivent être des entiers ≥ 0.',
  offline: 'Hors-ligne : la saisie sera envoyée à la reconnexion.',
  unexpectedError: 'Erreur inattendue',
  title: 'Saisir le score',
  closeAria: 'Fermer',
  team1Fallback: 'Équipe 1',
  team2Fallback: 'Équipe 2',
  markFinishedBefore: 'Marquer le match comme ',
  markFinishedStrong: 'terminé',
  markFinishedAfter: ' et propager le bracket',
  cancel: 'Annuler',
  save: 'Enregistrer',
});
