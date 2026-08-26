// lib/i18n/locales/fr/subscriptionForm.ts
//
// Traductions FRANCAISES du namespace `subscriptionForm` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('subscriptionForm', {
  title: "Rejoindre le Discord pour plus d'informations",
  joinBtn: 'Rejoindre',
});
