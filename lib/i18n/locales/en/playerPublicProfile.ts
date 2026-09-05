// lib/i18n/locales/en/playerPublicProfile.ts
//
// Traductions ANGLAISES du namespace `playerPublicProfile`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerPublicProfile.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  backToLeaderboard: '← Back to leaderboard',
  ratingProgression: 'Rating progression',
  tierBronze: 'bronze',
  tierSilver: 'silver',
  tierGold: 'gold',
  tierPlatinum: 'platinum',
  badges: 'Badges',
  palmares: 'Achievements',
  tournamentFallback: 'Tournament',
  withTeam: 'with',
  firstPlace: '1st place',
  secondPlace: '2nd place',
  thirdPlace: '3rd place',
  nthPlace: '{rank}th place',
  seasons: 'Seasons',
  thLeague: 'League',
  thRank: 'Rank',
  thPoints: 'Points',
  leagueFallback: 'League',
  rankLabel: 'Rank',
  matchesCount_one: '{count} match',
  matchesCount_other: '{count} matches',
  winRatePct: '{rate}% wins',
  ratingUncertaintyTitle:
    'Rating uncertainty (standard deviation). The lower the value, the more reliable the rating.',
  ratingDelta: '± {rd} · peak {peak}',
  statWins: 'Wins',
  statLosses: 'Losses',
  statPeak: 'Peak rating',
  chartNotEnough: 'Not enough matches yet to draw a progression curve.',
  chartMin: 'Min {value}',
  chartMax: 'Max {value}',
  chartPts: '{delta} pts',
  chartAriaLabel:
    'Rating progression curve, from {first} to {last} points over {count} matches.',
  recentMatches: 'Recent matches',
  noRecentMatches: 'No recent matches.',
  vs: 'vs',
  unknownOpponent: 'Unknown opponent',
  resultWin: 'W',
  resultLoss: 'L',
  resultDraw: 'D',
  headToHead: 'Head-to-head',
  noHeadToHead: 'No head-to-head recorded.',
  thOpponent: 'Opponent',
  thWinLoss: 'W - L',
  thMatches: 'Matches',
  unknownPlayer: 'Unknown player',
  notFoundTitle: 'Player not found',
  notFoundBody: 'This player does not exist or has no rating yet.',
  viewLeaderboard: 'View leaderboard',
  errorTitle: 'Unable to load this profile',
  errorBody: 'An error occurred. Please try again in a moment.',
  retry: 'Retry',
  share: 'Share',
  shareAriaLabel: 'Share this profile',
  shareTitle: "{name}'s profile on OW Women's Cup",
  linkCopied: 'Link copied',
  shareError: 'Could not copy the link',
  shareOnX: 'Share on X',
  shareOnBluesky: 'Share on Bluesky',
  twitchLinkHint: '(opens the Twitch channel in a new tab)',
};
