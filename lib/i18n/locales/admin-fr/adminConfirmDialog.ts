// lib/i18n/locales/admin-fr/adminConfirmDialog.ts
//
// Traductions FRANCAISES du namespace `adminConfirmDialog` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminConfirmDialog', {
  confirm: 'Confirmer',
  confirming: 'En cours...',
  cancel: 'Annuler',
});
