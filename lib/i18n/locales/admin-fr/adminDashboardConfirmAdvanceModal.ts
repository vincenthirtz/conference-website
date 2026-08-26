// lib/i18n/locales/admin-fr/adminDashboardConfirmAdvanceModal.ts
//
// Traductions FRANCAISES du namespace `adminDashboardConfirmAdvanceModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDashboardConfirmAdvanceModal', {
  offline: "Hors-ligne : l'avancement sera envoyé à la reconnexion.",
  unexpectedError: 'Erreur inattendue',
  title: 'Avancer la phase',
  bodyBefore: 'La phase ',
  bodyAfter: ' va être avancée automatiquement selon les règles configurées (',
  bodyClose: ').',
  warningBefore:
    'Les équipes éligibles seront ajoutées à la phase cible et la phase source sera désactivée. Cette action est ',
  warningStrong: 'idempotente',
  warningAfter:
    ' mais le nettoyage manuel reste à votre charge si vous souhaitez annuler.',
  cancel: 'Annuler',
  advanceNow: '🚀 Avancer maintenant',
});
