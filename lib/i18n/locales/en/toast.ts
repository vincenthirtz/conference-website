// lib/i18n/locales/en/toast.ts
//
// Traductions ANGLAISES du namespace `toast`.
//
// La SOURCE DE VERITE est le francais (`../fr/toast.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  close: 'Close',
};
