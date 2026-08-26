// lib/i18n/locales/fr/tournamentMaps.ts
//
// Traductions FRANCAISES du namespace `tournamentMaps` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentMaps', {
  headTitle: "Top maps – {name} | OW Women's Cup",
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  heading: 'Top maps – {name}',
  description:
    "Un aperçu des cartes les plus jouées du tournoi, avec le nombre de manches, d'overtimes et de tiebreakers. Pratique pour casters, analystes et strat-callers.",
  backToTournament: '← Retour au tournoi',
  allMatches: 'Tous les matchs',
  viewBracket: 'Voir le bracket',
  emptyGames:
    "Aucun game enregistré pour ce tournoi pour l'instant. Les stats de maps apparaîtront au fur et à mesure des résultats.",
  // Pool du tournoi — visible dès la publication, sans attendre le premier match.
  poolHeading: 'Pool de maps du tournoi',
  poolSubtitle:
    'Les cartes jouables sur ce tournoi, par mode. Les vignettes sont des maquettes réalisées par nos soins.',
  poolCount_one: '{count} carte',
  poolCount_other: '{count} cartes',
  poolModeControl: 'Contrôle',
  poolModeEscort: 'Escorte',
  poolModeHybrid: 'Hybride',
  poolModePush: 'Poussée',
  poolModeFlashpoint: 'Point chaud',
  poolModeOther: 'Autres',
  statDistinctMaps: 'Maps distinctes',
  statGamesPlayed: 'Games joués',
  statOvertimes: 'Overtimes',
  statTiebreakers: 'Tiebreakers',
  statTotalBans: 'Total bans',
  statMostBanned: 'Map la + bannie',
  hintBans: '{count} bans',
  top3Heading: 'Top 3 maps du tournoi',
  allMapsHeading: 'Toutes les maps jouées',
  colMap: 'Map',
  colGames: 'Games',
  colAvgRounds: 'Rounds moy.',
  colOvertimes: 'Overtimes',
  colBans: 'Bans',
  colPicks: 'Picks',
  colWinrates: 'Winrates',
  winLossAbbrev: '({wins}V-{losses}D)',
  note: 'Note : les stats sont calculées à partir des games enregistrés pour ce tournoi, en excluant les matchs bye.',
  rankMapFirst: '1er map',
  rankMapSecond: '2e map',
  rankMapThird: '3e map',
  gamesCount_one: '{count} game',
  gamesCount_other: '{count} games',
  avgRoundsLabel: 'Rounds moyen :',
  overtimesLabel: 'Overtimes :',
  bansLabel: 'Bans :',
  picksLabel: 'Picks :',
});
