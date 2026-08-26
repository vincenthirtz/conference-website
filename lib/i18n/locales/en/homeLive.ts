// lib/i18n/locales/en/homeLive.ts
//
// Traductions ANGLAISES du namespace `homeLive`.
//
// La SOURCE DE VERITE est le francais (`../fr/homeLive.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  ariaLabel: 'Live broadcast',
  liveOnTwitch: 'Live on Twitch',
  liveDefaultTitle: 'The stream is live',
  viewers_one: '{count} viewer connected',
  viewers_other: '{count} viewers connected',
};
