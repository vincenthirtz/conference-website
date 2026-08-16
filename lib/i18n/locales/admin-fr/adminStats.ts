// lib/i18n/locales/admin-fr/adminStats.ts
//
// Traductions FRANCAISES du namespace `adminStats` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStats', {
  pageTitle: 'Admin – Statistiques',
  heading: 'Statistiques',
  subtitle: 'Statistiques des équipes et des maps.',
  tabsAriaLabel: 'Catégories de statistiques',
  tabTeams: 'Équipes',
  tabMaps: 'Maps',
});
