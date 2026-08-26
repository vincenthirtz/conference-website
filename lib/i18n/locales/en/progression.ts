// lib/i18n/locales/en/progression.ts
//
// Traductions ANGLAISES du namespace `progression`.
//
// La SOURCE DE VERITE est le francais (`../fr/progression.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Your progression',
  subtitle:
    "Your rating over time and your team's milestones. Nothing invented: every line is a measured fact.",
  ratingLabel: 'Current rating',
  deltaOverGames: '{delta} over your last {count} rated matches',
  deltaUnknown: 'Not enough rated matches yet to measure a trend.',
  peakInline: '· best: {rating}',
  sparkAria: 'Rating trend over {count} rated matches, from {from} to {to}.',
  firstEncounter: 'First encounter on {date}',
  firstWin: 'First win on {date}',
  encountersReached: '{count} encounters played',
  peakRating: 'Best rating reached: {rating}',
  streakWin: 'Current streak: {count} wins',
  streakLoss: 'Current streak: {count} losses',
};
