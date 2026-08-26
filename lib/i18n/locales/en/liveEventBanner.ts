// lib/i18n/locales/en/liveEventBanner.ts
//
// Traductions ANGLAISES du namespace `liveEventBanner`.
//
// La SOURCE DE VERITE est le francais (`../fr/liveEventBanner.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  ariaLabel: 'Live event',
  liveNow: 'Live now',
  remaining: 'Left',
  waitingNext: 'Waiting for the next segment —',
  durationMin: '({count} min)',
  programInProgress: 'Programme in progress',
  typeMatch: 'Match',
  typeBreak: 'Break',
  typeIntro: 'Intro',
  typeOutro: 'Outro',
  typeCustom: 'Segment',
  typeFallback: 'Segment',
};
