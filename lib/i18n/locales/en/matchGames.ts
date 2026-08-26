// lib/i18n/locales/en/matchGames.ts
//
// Traductions ANGLAISES du namespace `matchGames`.
//
// La SOURCE DE VERITE est le francais (`../fr/matchGames.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  notFound: 'Match not found.',
  docTitle: "Maps – {team1} vs {team2} | {tournament} | OW Women's Cup",
  team1Fallback: 'Team 1',
  team2Fallback: 'Team 2',
  byeLabel: '(bye)',
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  statusCancelled: 'Cancelled',
  detailHeading: 'Maps breakdown',
  vs: 'vs',
  poule: 'Group {key}',
  intro:
    "View focused on this match's games: detailed map-by-map scores, overtimes, tiebreakers and total rounds.",
  backToSummary: '← Match summary',
  tournament: 'Tournament',
  topMaps: 'Tournament top maps',
  noMapsYet: 'No map has been recorded for this match yet.',
  statMapsPlayed: 'Maps played',
  statRoundsTeam: 'Rounds {team}',
  statRoundsDiff: 'Rounds difference',
  balanced: 'Balanced',
  mapsOfMatch: 'Match maps',
  mapsRecorded_one: '{count} map recorded',
  mapsRecorded_other: '{count} maps recorded',
  colMap: 'Map',
  colTotalRounds: 'Total rounds',
  colTags: 'Tags',
  mapFallback: 'Map {order}',
  tagTiebreaker: 'Tiebreaker',
  tagOvertime: 'Overtime',
  scoresHint:
    'Scores correspond to the cumulative rounds won by each team on the map (rounds, points, etc. depending on the game mode).',
};
