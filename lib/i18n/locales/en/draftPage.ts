// lib/i18n/locales/en/draftPage.ts
//
// Traductions ANGLAISES du namespace `draftPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/draftPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  invalidUrl: 'Invalid draft URL',
  loadingDraft: 'Loading draft…',
  draftTitle: 'MOBA Draft',
  docTitle: '{name} · Draft',
};
