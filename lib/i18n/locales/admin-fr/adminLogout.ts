// lib/i18n/locales/admin-fr/adminLogout.ts
//
// Traductions FRANCAISES du namespace `adminLogout` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminLogout', {
  loggingOut: 'Déconnexion en cours…',
  redirectNote: 'Tu vas être redirigé·e vers la page de connexion staff.',
});
