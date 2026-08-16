// lib/i18n/locales/fr/navbar.ts
//
// Traductions FRANCAISES du namespace `navbar` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('navbar', {
  roleLabels: {
    captain: 'Capitaine',
    player: 'Joueuse',
  },
  fallbackName: 'Joueuse',
  skipToContent: 'Aller au contenu principal',
  homeAria: 'Accueil',
  openMenu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  support: 'Soutenir',
  supportLong: 'Soutenir le projet',
  staffLogin: 'Connexion staff',
  login: 'Connexion',
  signup: 'Inscription',
  logout: 'Déconnexion',
  mobileMenuAria: 'Menu mobile',
  publicLinks: {
    Accueil: 'Accueil',
    Tournoi: 'Tournoi',
    Équipes: 'Équipes',
    Classement: 'Classement',
    Ligues: 'Ligues',
    Communauté: 'Communauté',
    "L'association": "L'association",
    'Ambassadeur·rices': 'Ambassadeur·rices',
    Partenaires: 'Partenaires',
    'Édition 2025': 'Édition 2025',
  },
});
