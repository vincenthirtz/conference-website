// lib/i18n/locales/en/teamStats.ts
//
// Traductions ANGLAISES du namespace `teamStats`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamStats.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badge: 'Team stats',
  backToTeam: '← Team page',
  statMatchesPlayed: 'Matches played',
  statRecord: 'Record',
  statWinrate: 'Winrate',
  statMaps: 'Maps',
  diffPositive: '+{diff} diff',
  diffNegative: '{diff} diff',
  diffNeutral: 'neutral diff',
  emptyMaps: 'Not enough recorded map data yet to compute detailed statistics.',
  mapProfileLabel: 'Team map profile',
  statDistinctMaps: 'Distinct maps',
  statMapGames: 'Map games',
  statFavoriteMap: 'Favorite map',
  favoriteMapHint: '{games} games · {wr}% WR',
  statMostPlayedMap: 'Most played map',
  mostPlayedHint: '{games} games',
  statsNote:
    'Statistics are computed over all matches played (across all tournaments) and recorded in the database.',
  detailedByMapTitle: 'Detailed stats by map',
  thMap: 'Map',
  thGames: 'Games',
  thW: 'W',
  thL: 'L',
  thWinrate: 'Winrate',
  thRounds: 'Rounds (+/-)',
  thOTs: 'OTs',
  thTiebreakers: 'Tiebreakers',
  overtimesNote:
    'Overtimes and tiebreakers are counted from the flags stored on each game.',
};
