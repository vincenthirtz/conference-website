// lib/i18n/locales/admin-en/adminStats.ts
//
// Traductions ANGLAISES du namespace admin `adminStats`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStats.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Statistiques',
  heading: 'Statistiques',
  subtitle: 'Statistiques des équipes et des maps.',
  tabsAriaLabel: 'Catégories de statistiques',
  tabTeams: 'Équipes',
  tabMaps: 'Maps',
};
