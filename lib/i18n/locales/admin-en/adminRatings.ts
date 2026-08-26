// lib/i18n/locales/admin-en/adminRatings.ts
//
// Traductions ANGLAISES du namespace admin `adminRatings`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminRatings.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Ratings',
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Ratings',
  heading: 'Player ratings',
  subtitle: 'Glicko-2 player ranking system.',
  rebuildHeading: 'Full rebuild',
  rebuildDesc:
    'Recomputes all Glicko-2 ratings by replaying every finished match in chronological order. Current team rosters are used as the backfill basis to attribute historical matches to players. Useful after a data fix or an algorithm change. This is a heavy operation: run it outside peak periods.',
  playerCount_one: '{count} player',
  playerCount_other: '{count} players',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matches',
  lastRebuild: 'Last rebuild: {players} across {matches}.',
  confirmTitle: 'Rebuild all ratings?',
  confirmSubtitle:
    'Heavy operation: recomputes the entire rating history from the first match. May take a while.',
  confirmLabel: 'Rebuild',
  rebuilding: 'Rebuilding…',
  rebuildBtn: 'Rebuild ratings',
  toastRebuilt: 'Ratings rebuilt: {players}, {matches}.',
  errorRebuild: 'Error during rebuild.',
  errorLoadBoard: 'Error while loading the leaderboard.',
  boardHeading: 'Top leaderboard',
  leaguesLink: 'Leagues →',
  retry: 'Retry',
  emptyTitle: 'No rated players',
  emptyDesc: 'Run a rebuild after recording some match results.',
  colPlayer: 'Player',
  colRating: 'Rating',
  colGames: 'Games',
  colWinLoss: 'W / L',
  coverageHeading: 'Rating coverage',
  coverageDesc:
    'A finished match only produces ratings if BOTH teams have members linked to an account. Otherwise it stays unrated, with no error — this is where you see it.',
  coverageUnavailable: 'Coverage unavailable right now.',
  coverageFinished: '{count} finished match(es)',
  coverageRated: '{count} rated',
  coverageUnrated: '{count} unrated',
  coverageColMatch: 'Match',
  coverageColReason: 'Why',
  coverageReasonNoParticipants: 'No linked roster (both teams)',
  coverageReasonOneSide: 'Linked roster on one side only',
  coverageReasonUnknown: 'Rosters present but no rating — needs investigation',
};
