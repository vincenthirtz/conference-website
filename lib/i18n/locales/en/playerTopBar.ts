// lib/i18n/locales/en/playerTopBar.ts
//
// Traductions ANGLAISES du namespace `playerTopBar`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerTopBar.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  site: 'Site',
  logout: 'Log out',
  fallbackName: 'Player',
  homeAria: 'Home',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  bellPending: 'Notifications ({count} pending)',
  bellEmpty: 'Notifications (none pending)',
  linkLabels: {
    dashboard: 'Dashboard',
    matches: 'My matches',
    discovery: 'Network',
    notifications: 'Notifications',
    profile: 'My profile',
  },
};
