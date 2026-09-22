// lib/i18n/locales/admin-en/adminTournamentMvpVotes.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentMvpVotes`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentMvpVotes.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais.

export default {
  heading: 'MVP votes',
  intro:
    'Live tally of MVP votes, match by match. “Leading” applies the settlement rule: Twitch wins if it has votes, at least {min} votes, no tie.',
  refresh: 'Refresh',
  autoRefresh: 'Refreshes every {seconds}s while a vote is open.',
  loading: 'Loading…',
  errorLoad: 'Could not load the votes.',
  empty: 'No MVP vote has been opened for this tournament yet.',
  totalVotes: 'Votes cast',
  openPolls: 'Open votes',
  matchesWithVotes: 'Matches with votes',
  filterAll: 'All',
  filterOpen: 'Open',
  filterClosed: 'Closed',
  stateOpen: 'Vote open',
  stateExpired: 'To settle',
  stateClosed: 'Closed',
  stateNone: 'No open vote',
  closesAt: 'Closes {date}',
  closedAt: 'Closed on {date}',
  noVotes: 'No votes yet.',
  votesCount: '{count} votes',
  leader: 'Leading: {name}',
  leaderDetail: '{votes}/{total} votes on {source}',
  reasonNoVotes: 'Nobody leading: no votes.',
  reasonTooFew: 'Nobody leading: fewer than {min} votes.',
  reasonTie: 'Nobody leading: tie.',
  winner: 'MVP: {name}',
  winnerManual: 'decided by staff',
  sourceTwitch: 'Twitch',
  sourceDiscord: 'Discord',
  vs: 'vs',
  tbd: 'TBD',
};
