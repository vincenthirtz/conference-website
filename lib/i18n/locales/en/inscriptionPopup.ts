// lib/i18n/locales/en/inscriptionPopup.ts
//
// Traductions ANGLAISES du namespace `inscriptionPopup`.
//
// La SOURCE DE VERITE est le francais (`../fr/inscriptionPopup.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Registration is open',
  registerBtn: 'Register',
};
