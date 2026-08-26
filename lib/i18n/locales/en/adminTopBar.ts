// lib/i18n/locales/en/adminTopBar.ts
//
// Traductions ANGLAISES du namespace `adminTopBar`.
//
// La SOURCE DE VERITE est le francais (`../fr/adminTopBar.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  accueilAria: 'Home',
  openProfileAria: 'Open my profile',
  staffFallback: 'Staff',
  siteMenu: 'Site',
  logout: 'Log out',
  alertsActive_one: '{count} active alert',
  alertsActive_other: '{count} active alerts',
};
