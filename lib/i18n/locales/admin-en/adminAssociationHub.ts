// lib/i18n/locales/admin-en/adminAssociationHub.ts
//
// Traductions ANGLAISES du namespace admin `adminAssociationHub`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminAssociationHub.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Association',
  heading: 'Association',
  subtitle: 'Casters, association poles and members.',
  tabsAriaLabel: 'Association sections',
  tabCast: 'Casters',
  tabPoles: 'Association poles',
  tabAdherents: 'Members',
};
