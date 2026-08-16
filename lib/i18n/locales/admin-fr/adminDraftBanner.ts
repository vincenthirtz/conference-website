// lib/i18n/locales/admin-fr/adminDraftBanner.ts
//
// Traductions FRANCAISES du namespace `adminDraftBanner` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDraftBanner', {
  message: 'Un brouillon non sauvegarde a ete trouve{suffix}.',
  restore: 'Restaurer',
  discard: 'Ignorer',
});
