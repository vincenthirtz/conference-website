// lib/i18n/locales/en/home.ts
//
// Traductions ANGLAISES du namespace `home`.
//
// La SOURCE DE VERITE est le francais (`../fr/home.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  loadError:
    "Some of the content couldn't be loaded. Please try again in a moment.",
};
