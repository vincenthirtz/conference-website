// lib/i18n/locales/en/printExport.ts
//
// Traductions ANGLAISES du namespace `printExport`.
//
// La SOURCE DE VERITE est le francais (`../fr/printExport.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  label: 'Export as PDF',
  hint: 'Opens the print dialog — pick “Save as PDF”',
};
