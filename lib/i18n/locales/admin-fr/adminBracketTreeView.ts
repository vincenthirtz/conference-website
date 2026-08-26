// lib/i18n/locales/admin-fr/adminBracketTreeView.ts
//
// Traductions FRANCAISES du namespace `adminBracketTreeView` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminBracketTreeView', {
  matchCount_one: '{count} match',
  matchCount_other: '{count} matchs',
  scoreEditTitle: 'Saisir le score',
  scoreSave: 'Enregistrer',
  scoreSaving: 'Enregistrement…',
  scoreCancel: 'Annuler',
  scoreInvalid: 'Scores invalides : entiers positifs requis.',
  scoreToastSaved: 'Score enregistré',
  scoreToastError: "Échec de l'enregistrement du score",
});
