// lib/i18n/locales/admin-fr/adminTcgPage.ts
//
// Traductions FRANCAISES du namespace `adminTcgPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminTcgPage.ts`
// (garde-fou : `../admin-parity.ts`).
//
// L'enveloppe de la page `/admin/tcg` : titre, sous-titre, intitulé des
// onglets. Les panneaux eux-mêmes gardent leurs namespaces — `adminTcgOverview`,
// `adminTcgPhotos`, `adminTcgFanart` — parce que mesurer une économie et
// relire la photo d'une personne restent deux métiers.

import { adminNs } from '../../ns';

export default adminNs('adminTcgPage', {
  pageTitle: 'TCG — Administration',
  heading: 'TCG',
  subtitle: 'L’économie, les photos à relire et les cartes fan art proposées.',
  tabsAriaLabel: 'Sections du TCG',
});
