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
