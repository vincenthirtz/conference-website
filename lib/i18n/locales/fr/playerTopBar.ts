// lib/i18n/locales/fr/playerTopBar.ts
//
// Traductions FRANCAISES du namespace `playerTopBar` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerTopBar', {
  site: 'Site',
  logout: 'Déconnexion',
  fallbackName: 'Joueuse',
  homeAria: 'Accueil',
  openMenu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  bellPending: 'Notifications ({count} en attente)',
  bellEmpty: 'Notifications (aucune en attente)',
  linkLabels: {
    dashboard: 'Tableau de bord',
    matches: 'Mes matchs',
    discovery: 'Réseau',
    notifications: 'Notifications',
    profile: 'Mon profil',
  },
});
