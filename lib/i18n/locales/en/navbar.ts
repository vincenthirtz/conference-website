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
  mobileMenuAria: 'Mobile menu',
  publicLinks: {
    Accueil: 'Home',
    Tournoi: 'Tournament',
    Équipes: 'Teams',
    Classement: 'Leaderboard',
    Ligues: 'Leagues',
    Communauté: 'Community',
    "L'association": 'The association',
    'Ambassadeur·rices': 'Ambassadors',
    Partenaires: 'Partners',
    'Édition 2025': '2025 edition',
  },
};
