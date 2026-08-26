// lib/i18n/locales/admin-fr/adminBracketMatchListView.ts
//
// Traductions FRANCAISES du namespace `adminBracketMatchListView` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminBracketMatchListView', {
  colTime: 'Heure',
  colTeam1: 'Équipe 1',
  colTeam2: 'Équipe 2',
  colFormat: 'Format',
  colRound: 'Round',
  colStatus: 'Statut',
});
