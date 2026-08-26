// lib/i18n/locales/fr/draftPage.ts
//
// Traductions FRANCAISES du namespace `draftPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('draftPage', {
  invalidUrl: 'URL de draft invalide',
  loadingDraft: 'Chargement de la draft…',
  draftTitle: 'Draft MOBA',
  docTitle: '{name} · Draft',
});
