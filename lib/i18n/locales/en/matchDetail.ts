// lib/i18n/locales/en/matchDetail.ts
//
// Traductions ANGLAISES du namespace `matchDetail`.
//
// La SOURCE DE VERITE est le francais (`../fr/matchDetail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  notFound: 'Match not found.',
  teamFallback1: 'Team 1',
  teamFallback2: 'Team 2',
  bye: '(bye)',
  poolPrefix: 'Group',
  summary:
    'Full match recap, map by map: scores, overtimes, tiebreakers, and practical info.',
  btnTournament: '← Tournament',
  btnAllMatches: 'All matches',
  btnBracket: 'Bracket',
  scoreGlobal: 'Overall score',
  endPrefix: 'End:',
  mapsPlayed_one: '{count} map played',
  mapsPlayed_other: '{count} maps played',
  mapsDetailTitle: 'Map by map',
  mapsRecorded_one: '{count} map recorded',
  mapsRecorded_other: '{count} maps recorded',
  noMapsDetail: "Map-by-map details aren't available yet for this match.",
  matchInfo: 'Match info',
  infoTournament: 'Tournament',
  infoStage: 'Stage',
  infoRound: 'Round',
  infoPool: 'Group',
  infoFormat: 'Format',
  infoLobby: 'Lobby',
  infoStream: 'Stream',
  viewStream: 'Watch the stream',
  infoReplay: 'Replay',
  viewVod: 'Watch the VOD ↗',
  infoBye: 'Bye',
  yes: 'Yes',
  no: 'No',
  staffNotes: 'Staff notes',
  mapLabel: 'Map {n}',
  vs: 'vs',
  tagTiebreaker: 'Tiebreaker',
  tagOvertime: 'Overtime',
  statusPending: 'Upcoming',
  statusOngoing: 'Live',
  statusFinished: 'Finished',
  statusCancelled: 'Cancelled',
  lineupsTitle: 'Line-ups',
  lineupsHint: 'Tap a player to open her profile',
  lineupCount_one: '{count} player',
  lineupCount_other: '{count} players',
  lineupSubs: 'Substitutes',
  lineupStaff: 'Coaching staff',
  lineupEmpty: 'No line-up recorded for this match.',
  lineupUnknown: 'Unknown player',
  lineupCaptain: 'Captain',
  mvpTitle: 'Match MVP',
  mvpBadge: 'MVP',
};
