// lib/i18n/locales/fr/embedBracket.ts
//
// Traductions FRANCAISES du namespace `embedBracket` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('embedBracket', {
  empty: "Le bracket de ce tournoi n'est pas encore disponible.",
  viewOn: 'Voir sur {site}',
});
