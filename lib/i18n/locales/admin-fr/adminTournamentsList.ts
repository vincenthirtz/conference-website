// lib/i18n/locales/admin-fr/adminTournamentsList.ts
//
// Traductions FRANCAISES du namespace `adminTournamentsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentsList', {
  headTitle: 'Admin – Tournois',
  pageTitle: 'Gestion des tournois',
  tournamentCount_one: '{count} tournoi',
  tournamentCount_other: '{count} tournois',
  loading: 'Chargement...',
  simulator: 'Simulateur',
  newTournament: 'Nouveau tournoi',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Nom ou slug...',
  statusLabel: 'Statut',
  allStatuses: 'Tous les statuts',
  dateFromLabel: 'Date début (depuis)',
  dateToLabel: "Date début (jusqu'au)",
  searchButton: 'Rechercher',
  retry: 'Réessayer',
  emptyTournaments: 'Aucun tournoi trouvé',
  badgePublic: 'Public',
  badgeFeatured: 'Featured',
  previous: 'Précédent',
  paginationRange: '{from} – {to}',
  paginationOf: ' sur {total}',
  next: 'Suivant',
  statusDraft: 'Brouillon',
  statusPublished: 'Publié',
  statusRunning: 'En cours',
  statusCompleted: 'Terminé',
  statusArchived: 'Archivé',
  statusUnknown: 'Inconnu',
  formatSingleElim: 'Single Elim',
  formatDoubleElim: 'Double Elim',
  formatSwiss: 'Swiss',
  formatRoundRobin: 'Round Robin',
  formatShowmatch: 'Showmatch',
});
