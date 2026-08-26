// lib/i18n/locales/admin-fr/adminDashboardUpcomingMatchRow.ts
//
// Traductions FRANCAISES du namespace `adminDashboardUpcomingMatchRow` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDashboardUpcomingMatchRow', {
  live: 'Live',
  mapLabel: 'Map',
  stream: 'Stream',
  resolve: 'Résoudre',
  scoreEntry: 'Saisir score',
  detail: 'Détail',
});
