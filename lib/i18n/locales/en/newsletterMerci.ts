// lib/i18n/locales/en/newsletterMerci.ts
//
// Traductions ANGLAISES du namespace `newsletterMerci`.
//
// La SOURCE DE VERITE est le francais (`../fr/newsletterMerci.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  confirmedTitle: 'Thank you!',
  confirmedBody: 'Your newsletter subscription is confirmed.',
  invalidTitle: 'Invalid link',
  invalidBody: 'This confirmation link is invalid or has expired.',
  backHome: 'Back to home',
};
