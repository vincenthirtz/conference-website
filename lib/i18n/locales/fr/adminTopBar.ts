// lib/i18n/locales/fr/adminTopBar.ts
//
// Traductions FRANCAISES du namespace `adminTopBar` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('adminTopBar', {
  accueilAria: 'Accueil',
  openProfileAria: 'Ouvrir mon profil',
  staffFallback: 'Staff',
  siteMenu: 'Site',
  logout: 'Déconnexion',
  alertsActive_one: '{count} alerte active',
  alertsActive_other: '{count} alertes actives',
});
