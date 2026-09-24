// lib/i18n/locales/fr/navbar.ts
//
// Traductions FRANCAISES du namespace `navbar` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('navbar', {
  roleLabels: {
    captain: 'Capitaine',
    player: 'Joueuse',
    supporter: 'Supportrice',
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
  accountMenu: 'Mon compte',
  accountMySpace: 'Mon espace',
  accountProfile: 'Mon profil',
  accountAdmin: 'Administration',
  mobileMenuAria: 'Menu mobile',
  publicLinks: {
    Accueil: 'Accueil',
    Tournoi: 'Tournoi',
    Équipes: 'Équipes',
    Classement: 'Classement',
    Ligues: 'Ligues',
    Communauté: 'Communauté',
    // /recrutement n'etait lie ni en navbar ni en footer : 0 annonce d'equipe
    // face a 13 joueuses libres. Les deux faces du marche sont cote a cote.
    'Rejoindre une équipe': 'Rejoindre une équipe',
    'Recruter une joueuse': 'Recruter une joueuse',
    "L'association": "L'association",
    Ambassadeur·rices: 'Ambassadeur·rices',
    'Cartes à collectionner': 'Cartes à collectionner',
    Partenaires: 'Partenaires',
    'Édition 2025': 'Édition 2025',
  },
});
