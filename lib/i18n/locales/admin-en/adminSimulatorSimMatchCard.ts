// lib/i18n/locales/admin-en/adminSimulatorSimMatchCard.ts
//
// Traductions ANGLAISES du namespace admin `adminSimulatorSimMatchCard`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminSimulatorSimMatchCard.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  simulate: 'Simulate',
  waiting: 'Waiting',
  locked: 'Locked',
  unlockTitle: 'Unlock this match',
  lockTitle: 'Lock this result (What-if)',
  wonBy: 'Won by {name}',
};
