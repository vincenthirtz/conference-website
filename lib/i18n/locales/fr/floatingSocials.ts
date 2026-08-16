// lib/i18n/locales/fr/floatingSocials.ts
//
// Traductions FRANCAISES du namespace `floatingSocials` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('floatingSocials', {
  donateTitle: 'Faire un don',
  qrAlt: 'QR code pour faire un don',
  scanPhone: 'Scanne avec ton téléphone',
});
