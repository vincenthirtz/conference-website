// lib/i18n/locales/en/navbar.ts
//
// Traductions ANGLAISES du namespace `navbar`.
//
// La SOURCE DE VERITE est le francais (`../fr/navbar.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  roleLabels: {
    captain: 'Captain',
    player: 'Player',
    supporter: 'Supporter',
  },
  fallbackName: 'Player',
  skipToContent: 'Skip to main content',
  homeAria: 'Home',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  support: 'Support us',
  supportLong: 'Support the project',
  staffLogin: 'Staff sign-in',
  login: 'Sign in',
  signup: 'Register',
  logout: 'Sign out',
  accountMenu: 'My account',
  accountMySpace: 'My space',
  accountProfile: 'My profile',
  accountAdmin: 'Admin',
  mobileMenuAria: 'Mobile menu',
  publicLinks: {
    Accueil: 'Home',
    Tournoi: 'Tournament',
    Équipes: 'Teams',
    Classement: 'Leaderboard',
    Ligues: 'Leagues',
    Communauté: 'Community',
    // /recrutement n'etait lie ni en navbar ni en footer : 0 annonce d'equipe
    // face a 13 joueuses libres. Les deux faces du marche sont cote a cote.
    'Rejoindre une équipe': 'Join a team',
    'Recruter une joueuse': 'Recruit a player',
    "L'association": 'The association',
    Ambassadeur·rices: 'Ambassadors',
    'Cartes à collectionner': 'Trading cards',
    Partenaires: 'Partners',
    'Édition 2025': '2025 edition',
  },
};
