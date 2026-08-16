// lib/i18n/locales/admin-fr/adminStatsMaps.ts
//
// Traductions FRANCAISES du namespace `adminStatsMaps` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStatsMaps', {
  errorUnexpected: 'Erreur inattendue',
  pageTitle: 'Admin – Stats maps',
  back: 'Retour au dashboard admin',
  heading: 'Stats maps',
  subtitle:
    'Analyse des performances & de la popularité des maps (pick-rate, winrate attaque/défense, volume de matchs & manches).',
  exportCsv: 'Export CSV',
  filterMapLabel: 'Map',
  filterMapPlaceholder: 'Nom de la map (ex: Ascent, Bind…)',
  filterMinMatchesLabel: 'Min. matchs',
  sortByLabel: 'Trier par',
  sortMatchesPlayed: 'Matchs joués',
  sortRoundsPlayed: 'Rounds totaux',
  sortWinsTeam1: 'Victoires Team 1',
  sortWinsTeam2: 'Victoires Team 2',
  sortAvgRounds: 'Moy. rounds/match',
  sortMapName: 'Nom de la map',
  orderLabel: 'Ordre',
  orderDesc: 'Descendant',
  orderAsc: 'Ascendant',
  filterSubmit: 'Filtrer',
  loading: 'Chargement...',
  mapsCount: 'Maps ({count})',
  tableCaption:
    'Calcul effectué côté API à partir des matchs et des rounds joués.',
  emptyState: 'Aucune map pour ces filtres.',
  thMap: 'Map',
  thMatchesPlayed: 'Matchs joués',
  thWinsTeam1: 'Victoires Team 1',
  thWinsTeam2: 'Victoires Team 2',
  thWinrate: 'Winrate T1 / T2',
  thRoundsTotal: 'Rounds totaux',
  thAvgRounds: 'Moy. rounds/match',
  previous: 'Précédent',
  next: 'Suivant',
  paginationOf: ' sur {total}',
});
