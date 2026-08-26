// lib/i18n/locales/admin-fr/adminOnboarding.ts
//
// Traductions FRANCAISES du namespace `adminOnboarding` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminOnboarding', {
  pageTitle: 'Admin – Onboarding',
  heading: 'Onboarding',
  subtitle:
    "Files d'approbation plateforme : demandes self-service, liens Discord en attente.",
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Onboarding',
  tabsAriaLabel: "Sections d'onboarding",
  tabQueue: "File d'onboarding",
  tabTenantRequests: 'Demandes de tenant',
  tabGuildLinks: 'Liens Discord',
});
