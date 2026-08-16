// lib/i18n/locales/fr/pwa.ts
//
// Traductions FRANCAISES du namespace `pwa` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('pwa', {
  updateTitle: 'Nouvelle version disponible',
  updateBody: 'Recharge pour mettre à jour.',
  reload: 'Recharger',
  later: 'Plus tard',
  install: "Installer l'app",
  installAria: "Installer l'application",
});
