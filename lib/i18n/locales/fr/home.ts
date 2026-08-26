// lib/i18n/locales/fr/home.ts
//
// Traductions FRANCAISES du namespace `home` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('home', {
  loadError:
    "Une partie du contenu n'a pas pu être chargée. Réessayez dans quelques instants.",
});
