// lib/i18n/locales/en/specialty.ts
//
// Traductions ANGLAISES du namespace `specialty`.
//
// La SOURCE DE VERITE est le francais (`../fr/specialty.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  tank: 'Tank',
  dps: 'DPS',
  support: 'Support',
  flex: 'Flex',
};
