// lib/i18n/locales/fr/pressSection.ts
//
// Traductions FRANCAISES du namespace `pressSection` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('pressSection', {
  eyebrow: 'Presse',
  title: 'Ils parlent de nous',
  subtitle: "Retrouvez les articles et médias qui couvrent l'OW Women's Cup.",
  readArticle: "Lire l'article",
});
