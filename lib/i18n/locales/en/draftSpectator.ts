// lib/i18n/locales/en/draftSpectator.ts
//
// Traductions ANGLAISES du namespace `draftSpectator`.
//
// La SOURCE DE VERITE est le francais (`../fr/draftSpectator.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  sideBlue: 'BLUE SIDE',
  sideRed: 'RED SIDE',
  sideRadiant: 'RADIANT',
  sideDire: 'DIRE',
  pickLabel: 'Pick #{num}',
  autoSuffix: ' · AUTO',
  bans: 'Bans',
  banned: '{name} (banned)',
  awaitingBan: 'Awaiting ban #{num}',
  draftNotStarted: 'Draft not started yet',
  gameShort: 'Game',
  fearlessSuffix: ' · FEARLESS',
  draftTitle: 'MOBA Draft',
  step: 'Step',
};
