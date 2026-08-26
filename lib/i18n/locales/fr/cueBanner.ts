// lib/i18n/locales/fr/cueBanner.ts
//
// Traductions FRANCAISES du namespace `cueBanner` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('cueBanner', {
  sevInfo: 'Info',
  sevWarn: 'Attention',
  sevUrgent: 'URGENT',
  newCues: '{count} nouvelles consignes',
  see: 'Voir',
});
