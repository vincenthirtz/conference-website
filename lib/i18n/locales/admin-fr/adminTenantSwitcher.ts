// lib/i18n/locales/admin-fr/adminTenantSwitcher.ts
//
// Traductions FRANCAISES du namespace `adminTenantSwitcher` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTenantSwitcher', {
  tenantTitle: 'Tenant : {name}',
  switchedToast: 'Tenant actif : {name}',
  switchError: 'Impossible de changer de tenant.',
  activeTenantHeader: 'Tenant actif',
  inactiveSuffix: ' • inactif',
});
