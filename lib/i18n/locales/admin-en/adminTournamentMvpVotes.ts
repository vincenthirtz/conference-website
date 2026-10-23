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
    'The “audience favourite”: opened by the broadcast crew until it is closed manually (4 h at most, then it closes by itself), Twitch viewers (!mvp N) and Discord supporters. Unlike the teams’ vote, both platforms are ADDED UP. “Leading” applies that rule: at least {min} votes in total, no tie.',
  emptyPublic:
    'No audience vote has been opened for this tournament yet. It opens from the caster cockpit (/admin/caster › MVP poll), with a match linked.',
  sourceCombined: 'Twitch + Discord',
  openTitle: 'Start an audience vote',
  openHelp:
    'For a match in progress, finished or upcoming — e.g. at the end of a broadcast, before the score is entered. The bot posts the vote in its Discord channel (supporters), and Twitch chat votes with !mvp <name>. The vote stays open until “Close now”, 4 h at most: after that, it closes and is settled by itself.',
  openNone:
    'No match (in progress, finished or upcoming) without an audience vote.',
  openNoneToday: 'No match today: here are all the tournament’s matches.',
  openShowAll: 'All tournament matches ({count})',
  openStateOngoing: 'In progress',
  openStateUpcoming: 'Upcoming',
  openMatchLabel: 'Match',
  openCta: 'Start the vote',
  openDone: 'Audience vote started.',
  closeCta: 'Close now',
  closeConfirmTitle: 'Close the audience vote?',
  closeConfirmBody:
    '{match} — {votes} votes. Settling names the audience MVP and pays her TCG coins. “Restart the vote” would reopen it, keeping the votes.',
  closeDone: 'Audience vote closed.',
  twitchChatMissingScope:
    'Vote started, but Twitch chat is not counting !mvp: the channel must be reconnected (chat permissions). Discord votes count.',
  twitchChatNotConnected:
    'Vote started, but no Twitch channel is connected: only Discord votes count.',
  twitchChatFailed:
    'Vote started, but the Twitch chat subscription failed: chat !mvp will not be counted. Discord votes count.',
  reopenCta: 'Restart the vote',
  reopenConfirmTitle: 'Restart the audience vote?',
  reopenConfirmBody:
    'The vote reopens until you close it, 4 h at most. Votes already cast are kept; the displayed result is cleared until the next close. If another player wins, she also receives her TCG coins.',
  reopenDone: 'Audience vote restarted.',
  actionError: 'The operation failed.',
};
