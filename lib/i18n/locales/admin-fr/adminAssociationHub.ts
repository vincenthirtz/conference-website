// lib/i18n/locales/admin-fr/adminAssociationHub.ts
//
// Traductions FRANCAISES du namespace `adminAssociationHub` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminAssociationHub', {
  pageTitle: 'Admin – Association',
  heading: 'Association',
  subtitle: "Casteuses, pôles de l'asso et adhérents.",
  tabsAriaLabel: "Sections de l'association",
  tabCast: 'Casteuses',
  tabPoles: "Pôles de l'asso",
  tabAdherents: 'Adhérents',
});
