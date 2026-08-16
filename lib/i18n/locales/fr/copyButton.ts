// lib/i18n/locales/fr/copyButton.ts
//
// Traductions FRANCAISES du namespace `copyButton` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('copyButton', {
  copy: 'Copier',
  copied: 'Copié !',
  error: 'Erreur',
});
