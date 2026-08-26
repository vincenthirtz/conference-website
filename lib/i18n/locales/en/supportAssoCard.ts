// lib/i18n/locales/en/supportAssoCard.ts
//
// Traductions ANGLAISES du namespace `supportAssoCard`.
//
// La SOURCE DE VERITE est le francais (`../fr/supportAssoCard.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Lend the association a hand?',
  body: "Tickets are free, but a donation or a membership helps us keep the Women's Cup running.",
  donateCta: 'Make a donation',
  joinCta: 'Become a member',
  dismiss: 'Later',
  dismissAria: 'Hide the association support card',
};
