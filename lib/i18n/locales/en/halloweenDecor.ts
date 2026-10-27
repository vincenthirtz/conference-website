// lib/i18n/locales/en/halloweenDecor.ts
//
// Traductions ANGLAISES du namespace `halloweenDecor`.
//
// La SOURCE DE VERITE est le francais (`../fr/halloweenDecor.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  hide: 'Turn off the Halloween decorations',
  show: 'Turn the Halloween decorations back on',
};
