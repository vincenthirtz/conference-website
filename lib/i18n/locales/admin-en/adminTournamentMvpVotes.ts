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
  headingPublic: 'Audience MVP votes',
  introPublic:
    'The “audience favourite”: opened by the broadcast crew from the caster cockpit, about ten minutes, Twitch viewers (!mvp N) and Discord supporters. Unlike the teams’ vote, both platforms are ADDED UP. “Leading” applies that rule: at least {min} votes in total, no tie.',
  emptyPublic:
    'No audience vote has been opened for this tournament yet. It opens from the caster cockpit (/admin/caster › MVP poll), with a match linked.',
  sourceCombined: 'Twitch + Discord',
  openTitle: 'Start an audience vote',
  openHelp:
    'For a finished match, without the caster cockpit (a match that is not broadcast, for instance). The bot posts the vote in its Discord channel; only supporters vote, Twitch chat !mvp votes are relayed by the cockpit only.',
  openNone: 'No finished match without an audience vote.',
  openMatchLabel: 'Match',
  openMinutesLabel: 'Duration (min)',
  openCta: 'Start the vote',
  openDone: 'Audience vote started.',
  closeCta: 'Close now',
  closeDone: 'Audience vote closed.',
  actionError: 'The operation failed.',
};
