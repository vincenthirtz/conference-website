// lib/i18n/locales/admin-fr/adminTournamentAnalytics.ts
//
// Traductions FRANCAISES du namespace `adminTournamentAnalytics` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentAnalytics', {
  pageTitle: 'Admin – Analytics du tournoi',
  back: '← Retour au tableau de bord',
  heading: 'Analytics du tournoi',
  tournamentLabel: 'Tournoi : ',
  loading: 'Chargement...',
  refresh: 'Actualiser',
  loadingAnalytics: 'Chargement des analytics...',
  empty: 'Aucune donnée analytique pour ce tournoi (aucun match joué).',
  kpiMatchesPlayed: 'Matchs joués',
  kpiGamesPlayed: 'Games jouées',
  kpiAvgDuration: 'Durée moy. / game',
  kpiOvertime: '% Overtime',
  kpiDecisiveGames: '% Games décisifs',
  kpiTotalMatches: 'Matchs total',
  tierListTitle: 'Tier list',
  tierListSubtitle:
    'Composite : 65 % de matchs gagnés, 35 % de manches gagnées. Seuils fixes — un plateau serré peut n’avoir aucune équipe en S.',
  tierListEmpty: 'Pas encore assez de matchs joués pour classer les équipes.',
  tierTeamTitle:
    '{wins} victoires, {losses} défaites — {maps} de manches gagnées',
  tierUnranked: 'Non classées (moins de {minPlayed} matchs joués) : {teams}.',
  comparatorTitle: 'Comparateur',
  comparatorSubtitle:
    'Deux équipes côte à côte, et leur face-à-face réel dans ce tournoi.',
  comparatorLeft: 'Équipe A',
  comparatorRight: 'Équipe B',
  comparatorMetric: 'Mesure',
  comparatorPlayed: 'Matchs joués',
  comparatorRecord: 'Bilan (V–D)',
  comparatorWinRate: 'Taux de victoire',
  comparatorMaps: 'Manches (gagnées–perdues)',
  comparatorDuel:
    'Face-à-face : {matches} match(s) — {left} {leftWins}, {right} {rightWins} ; manches {leftMaps}–{rightMaps}.',
  comparatorNoDuel:
    'Ces deux équipes ne se sont pas rencontrées dans ce tournoi.',
  comparatorPickTwo: 'Choisissez deux équipes différentes.',
  teamsTitle: 'Équipes',
  teamsSubtitle: "Classement fourni par l'API",
  teamsEmpty: "Aucune statistique d'équipe.",
  colTeam: 'Équipe',
  colPlayed: 'Joués',
  colWins: 'V',
  colLosses: 'D',
  colWinrate: 'Winrate',
  colMaps: 'Maps',
  mapsTitle: 'Maps',
  mapsSubtitle: 'Picks / bans / parties jouées',
  mapsEmpty: 'Aucune statistique de map.',
  colMap: 'Map',
  colPicks: 'Picks',
  colBans: 'Bans',
  colGames: 'Games',
  colAvgDuration: 'Durée moy.',
  colOvertime: '% OT',
  heroesTitle: 'Héros',
  heroesSubtitle: 'Picks / bans / winrate',
  heroesEmpty: 'Aucune statistique de héros.',
  colHero: 'Héros',
  errorUnexpected: 'Erreur inattendue',
});
