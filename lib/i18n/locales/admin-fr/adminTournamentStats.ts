// lib/i18n/locales/admin-fr/adminTournamentStats.ts
//
// Traductions FRANCAISES du namespace `adminTournamentStats` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentStats', {
  pageTitle: 'Admin – Statistiques du tournoi',
  back: '← Retour au tournoi',
  heading: 'Statistiques du tournoi',
  tournamentLabel: 'Tournoi : ',
  loading: 'Chargement...',
  refresh: 'Actualiser',
  loadingStats: 'Chargement des statistiques...',
  kpiTeams: 'Équipes',
  kpiTotalMatches: 'Matchs total',
  kpiFinished: 'Terminés',
  kpiOngoing: 'En cours',
  kpiPending: 'À venir',
  kpiMapsPlayed: 'Maps jouées',
  kpiOvertimes: 'Overtimes',
  teamRankingTitle: 'Classement des équipes',
  teamRankingSubtitle: 'Par winrate (min. 1 match joué)',
  teamsEmpty: "Aucune statistique d'équipe disponible.",
  colTeam: 'Équipe',
  colWins: 'V',
  colLosses: 'D',
  colWinrate: 'Winrate',
  colMaps: 'Maps',
  mapStatsTitle: 'Statistiques des maps',
  mapStatsSubtitle: 'Par nombre de parties jouées',
  mapsEmpty: 'Aucune statistique de map disponible.',
  colMap: 'Map',
  colGames: 'Parties',
  colUsage: 'Usage',
  colAvgRounds: 'Moy. rounds',
  colOT: 'OT',
  closestTitle: 'Matchs les plus serrés',
  closestSubtitle: 'Différence de score minimale (matchs terminés)',
  closestEmpty: 'Aucun match terminé.',
  unknownStage: 'Stage inconnu',
  roundLabel: ' • Round {n}',
  errorUnexpected: 'Erreur inattendue',
});
