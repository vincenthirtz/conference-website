// lib/i18n/locales/fr/printExport.ts
//
// Traductions FRANCAISES du namespace `printExport` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('printExport', {
  label: 'Exporter en PDF',
  // Dit ce qui va se passer : la boîte d'impression du navigateur s'ouvre, et
  // c'est « Enregistrer au format PDF » qu'il faut y choisir. Sans ça, la
  // personne clique, voit une fenêtre d'imprimante et referme.
  hint: 'Ouvre la fenêtre d’impression — choisis « Enregistrer au format PDF »',
});
