// lib/i18n/locales/admin-fr/adminStatsTeams.ts
//
// Traductions FRANCAISES du namespace `adminStatsTeams` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStatsTeams', {
  errorUnexpected: 'Erreur inattendue',
  pageTitle: 'Admin – Stats équipes',
  back: 'Retour au dashboard admin',
  heading: 'Stats équipes',
  countRanked_one: '{total} équipe classée',
  countRanked_other: '{total} équipes classées',
  loading: 'Chargement...',
  exportCsv: 'Export CSV',
  filterTournamentLabel: 'Tournoi',
  tournamentsLoading: 'Chargement des tournois…',
  tournamentsAll: 'Tous les tournois',
  filterMinMatchesLabel: 'Min. matchs',
  filterSearchLabel: 'Recherche',
  filterSearchPlaceholder: 'Nom, tag…',
  sortByLabel: 'Trier par',
  sortWinrate: 'Winrate match',
  sortMapWinrate: 'Winrate maps',
  sortMatchesPlayed: 'Matchs joués',
  sortPoints: 'Points',
  sortLastMatch: 'Dernier match',
  orderLabel: 'Ordre',
  orderDesc: 'Desc',
  orderAsc: 'Asc',
  filterSubmit: 'Filtrer',
  emptyState: 'Aucune équipe pour ces filtres',
  thTeam: 'Équipe',
  thTournament: 'Tournoi',
  thMatches: 'Matchs',
  thWDL: 'V/D/N',
  thWinrate: 'Winrate',
  thMaps: 'Maps',
  thMapWinrate: 'WR Maps',
  thPoints: 'Points',
  thLastMatch: 'Dernier match',
  previous: 'Précédent',
  next: 'Suivant',
  paginationOf: ' sur {total}',
});
