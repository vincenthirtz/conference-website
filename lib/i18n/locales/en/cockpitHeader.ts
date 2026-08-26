// lib/i18n/locales/en/cockpitHeader.ts
//
// Traductions ANGLAISES du namespace `cockpitHeader`.
//
// La SOURCE DE VERITE est le francais (`../fr/cockpitHeader.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  roleFallback: 'Caster',
  install: 'Install',
  quit: 'Quit',
  statusOnline: 'Online',
  statusSeen: 'Seen by control room',
  statusReconnecting: 'Reconnecting…',
  statusOffline: 'Offline',
};
