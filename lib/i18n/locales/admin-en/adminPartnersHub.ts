// lib/i18n/locales/admin-en/adminPartnersHub.ts
//
// Traductions ANGLAISES du namespace admin `adminPartnersHub`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPartnersHub.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Partners',
  heading: 'Partners',
  subtitle: 'Site partners and incoming partnership requests.',
  tabsAriaLabel: 'Partner sections',
  tabList: 'Partners',
  tabRequests: 'Requests',
};
