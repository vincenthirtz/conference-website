// lib/i18n/locales/fr/teamStats.ts
//
// Traductions FRANCAISES du namespace `teamStats` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamStats', {
  badge: 'Stats équipe',
  backToTeam: '← Fiche équipe',
  statMatchesPlayed: 'Matchs joués',
  statRecord: 'Bilan',
  statWinrate: 'Winrate',
  statMaps: 'Maps',
  diffPositive: '+{diff} diff',
  diffNegative: '{diff} diff',
  diffNeutral: 'diff neutre',
  emptyMaps:
    'Pas encore assez de données de maps enregistrées pour calculer des statistiques détaillées.',
  mapProfileLabel: "Profil de maps de l'équipe",
  statDistinctMaps: 'Maps distinctes',
  statMapGames: 'Games maps',
  statFavoriteMap: 'Map préférée',
  favoriteMapHint: '{games} games · {wr}% WR',
  statMostPlayedMap: 'Map la plus jouée',
  mostPlayedHint: '{games} games',
  statsNote:
    "Les statistiques sont calculées sur l'ensemble des matchs joués (tous tournois confondus) et enregistrés dans la base de données.",
  detailedByMapTitle: 'Stats détaillées par map',
  thMap: 'Map',
  thGames: 'Games',
  thW: 'W',
  thL: 'L',
  thWinrate: 'Winrate',
  thRounds: 'Rounds (+/-)',
  thOTs: 'OTs',
  thTiebreakers: 'Tiebreakers',
  overtimesNote:
    'Les overtimes et tiebreakers sont comptés à partir des flags stockés sur chaque game.',
});
