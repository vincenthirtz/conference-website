// lib/i18n/locales/fr/halloweenDecor.ts
//
// Traductions FRANCAISES du namespace `halloweenDecor` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('halloweenDecor', {
  hide: 'Éteindre la décoration d’Halloween',
  show: 'Rallumer la décoration d’Halloween',
});
