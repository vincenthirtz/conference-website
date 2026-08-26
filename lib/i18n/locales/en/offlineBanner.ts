// lib/i18n/locales/en/offlineBanner.ts
//
// Traductions ANGLAISES du namespace `offlineBanner`.
//
// La SOURCE DE VERITE est le francais (`../fr/offlineBanner.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  offlineTitle: 'Offline',
  queued_one: '{count} action queued — replayed once you reconnect.',
  queued_other: '{count} actions queued — replayed once you reconnect.',
  queueEmpty: 'Your critical actions will be queued.',
  syncTitle: 'Syncing',
  sending_one: '{count} action being sent…',
  sending_other: '{count} actions being sent…',
};
