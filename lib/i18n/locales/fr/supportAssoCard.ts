// lib/i18n/locales/fr/supportAssoCard.ts
//
// Traductions FRANCAISES du namespace `supportAssoCard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('supportAssoCard', {
  title: "Un coup de main à l'asso ?",
  body: "La billetterie est gratuite, mais un don ou une adhésion nous aide à faire vivre la Women's Cup.",
  donateCta: 'Faire un don',
  joinCta: "Adhérer à l'asso",
  dismiss: 'Plus tard',
  dismissAria: "Masquer l'encart de soutien à l'association",
});
