// lib/i18n/locales/admin-fr/adminPartnersHub.ts
//
// Traductions FRANCAISES du namespace `adminPartnersHub` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPartnersHub', {
  pageTitle: 'Admin – Partenaires',
  heading: 'Partenaires',
  subtitle: 'Partenaires du site et demandes de partenariat entrantes.',
  tabsAriaLabel: 'Sections partenaires',
  tabList: 'Partenaires',
  tabRequests: 'Demandes',
});
