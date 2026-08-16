// lib/i18n/locales/admin-fr/adminApiTokenReveal.ts
//
// Traductions FRANCAISES du namespace `adminApiTokenReveal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminApiTokenReveal', {
  title: 'Votre nouveau token API',
  warning:
    'Ce token ne sera plus jamais affiché après la fermeture de cette fenêtre. Copiez-le et conservez-le dans un endroit sûr.',
  tokenLabel: 'Token',
  copy: 'Copier',
  copied: 'Copié !',
  copiedToast: 'Token copié dans le presse-papier.',
  copyError: 'Copie impossible : copie-le manuellement.',
  close: "J'ai copié le token, fermer",
});
