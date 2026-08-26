// lib/i18n/locales/en/leaderboardPage.ts
//
// Traductions ANGLAISES du namespace `leaderboardPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/leaderboardPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'Leaderboard',
  title: 'Player leaderboard',
  subtitle:
    'Rating computed from official matches. The uncertainty (RD) reflects how reliable the score is: the lower it is, the more stable the rating.',
  thRank: 'Rank',
  thPlayer: 'Player',
  thRating: 'Rating',
  thMatches: 'Matches',
  thWinLoss: 'W - L',
  loadMore: 'Load more',
  loading: 'Loading…',
  unknownPlayer: 'Unknown player',
  emptyTitle: 'No ranked players yet',
  emptyBody:
    'The leaderboard will fill up as soon as official matches have been played. Check back soon!',
  errorTitle: 'Unable to load the leaderboard',
  errorBody: 'Something went wrong. Please try again in a moment.',
  retry: 'Try again',
  axisNavLabel: 'Leaderboard axes',
  axisRating: 'Rating',
  axisProgress: 'Momentum',
  axisSeason: 'Season',
  thDelta: 'Change',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matches',
  progressCaption: 'Biggest rating gains over the last {days} days.',
  progressEmpty:
    'No official match has been played in recent weeks. This tab will fill up once play resumes.',
  seasonCaption: 'Rating gained across the {season} tournaments.',
  seasonCaptionFallback: 'Rating gained across the season.',
  seasonStandingsLink: 'See the team standings →',
  seasonEmpty:
    'No results for this season yet. The ranking will appear after the first tournament.',
};
