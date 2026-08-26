// lib/i18n/locales/en/playerDiscovery.ts
//
// Traductions ANGLAISES du namespace `playerDiscovery`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerDiscovery.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  backToDashboard: 'Back to dashboard',
  pageTitle: 'Player network',
  pageSubtitle:
    'Find players who chose to appear in the network. Discovery is available to signed-in members only.',
  searchLabel: 'Search for a player',
  searchPlaceholder: 'Name, Discord handle…',
  loading: 'Loading…',
  emptyTitle: 'No player found',
  emptyHint:
    'Try another name, or check back later: the network grows as more players make themselves visible.',
  notDiscoverableBanner:
    "You don't appear in the network yet — turn on your visibility from your profile.",
  notDiscoverableCta: 'Manage my visibility',
  loadMore: 'Load more',
  resultsCount: '{count} player(s)',
  statsLine: '{games} games · peak {peak} · {tenants} orgs',
  cardTitle: 'Discovery / Player network',
  cardDesc:
    "Join the cross-organization directory. You're invisible by default; turn on discovery to appear in other members' searches. Reversible at any time.",
  masterSwitchLabel: 'Make me discoverable in the network',
  masterSwitchHint:
    'Invisible by default. You can turn discovery off whenever you want.',
  masterAriaLabel: 'Enable my visibility in the network',
  taglineLabel: 'Tagline',
  taglinePlaceholder:
    'A short line to introduce yourself (role, availability, goals…).',
  taglineCounter: '{count}/160',
  taglineSave: 'Save tagline',
  taglineSaving: 'Saving…',
  showRatingsLabel: 'Show my statistics',
  showRatingsHint:
    'Your rating, peak and performances will be visible on your profile.',
  showRatingsAria: 'Show my statistics in the network',
  showTeamsLabel: 'Show my teams',
  showTeamsHint: 'The teams you belong to will be visible on your profile.',
  showTeamsAria: 'Show my teams in the network',
  browseLink: 'Browse the network',
  saved: 'Preferences saved.',
  saveError: "Couldn't save your preferences.",
  loadError: "Couldn't load your discovery preferences.",
  followLabel: 'Follow',
  followingLabel: 'Following ✓',
  followError: "Couldn't update your follow.",
  followNotDiscoverable: 'This player is no longer discoverable.',
  teamsSrLabel: "Player's teams",
  followerCount: '{count} follower(s)',
  tabsAria: 'Network sections',
  tabDiscover: 'Discover',
  tabFollowing: 'Following',
  tabFollowers: 'Followers',
  followingEmptyTitle: "You're not following anyone yet",
  followingEmptyHint: 'Head to the Discover tab to find players to follow.',
  followersEmptyTitle: 'Nobody follows you yet',
  followersEmptyHint:
    'Make yourself visible and take part in the network to gain followers.',
  h2hTitle: 'Cross-network head-to-head',
  h2hCaveat:
    'Team-vs-team results within the same match — not individual duels.',
  h2hPlayed: '{count} matchup(s)',
  h2hEmpty: 'No matchups yet.',
  h2hYourWins: 'Your wins',
  h2hTheirWins: 'Their wins',
  h2hDraws: 'Draws',
  h2hResultWin: 'Win',
  h2hResultLoss: 'Loss',
  h2hResultDraw: 'Draw',
  h2hResultWinShort: 'W',
  h2hResultLossShort: 'L',
  h2hResultDrawShort: 'D',
  listError: 'Unable to load players. Please try again.',
  loadMoreError: 'Unable to load more players. Please try again.',
  retry: 'Retry',
};
