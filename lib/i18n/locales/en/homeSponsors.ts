// lib/i18n/locales/en/homeSponsors.ts
//
// Traductions ANGLAISES du namespace `homeSponsors`.
//
// La SOURCE DE VERITE est le francais (`../fr/homeSponsors.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'Partners',
  title: "They support the OW Women's Cup",
  subtitle: 'A production made possible by our official partners.',
  listAria: 'Partner list',
  viewAll: 'See all partners',
};
