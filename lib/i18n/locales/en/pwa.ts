// lib/i18n/locales/en/pwa.ts
//
// Traductions ANGLAISES du namespace `pwa`.
//
// La SOURCE DE VERITE est le francais (`../fr/pwa.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  updateTitle: 'New version available',
  updateBody: 'Reload to update.',
  reload: 'Reload',
  later: 'Later',
  install: 'Install the app',
  installAria: 'Install the application',
};
