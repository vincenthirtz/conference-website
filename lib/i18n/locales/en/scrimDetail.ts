// lib/i18n/locales/en/scrimDetail.ts
//
// Traductions ANGLAISES du namespace `scrimDetail`.
//
// La SOURCE DE VERITE est le francais (`../fr/scrimDetail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  backToScrims: '← All scrims',
  about: 'About',
  viewStream: 'Watch the stream →',
  matchesHeading: 'Matches ({count})',
  noMatches: 'Match schedule coming soon.',
  matchNumber: 'Match #{n}',
  vs: 'vs',
  finalScore: 'Final score',
  draw: 'Draw',
  tbd: 'to be defined',
  dateTbd: 'Date to be defined',
};
