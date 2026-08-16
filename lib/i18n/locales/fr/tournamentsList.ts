// lib/i18n/locales/fr/tournamentsList.ts
//
// Traductions FRANCAISES du namespace `tournamentsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentsList', {
  badgeCompetition: 'Compétition',
  title: 'Tous les tournois',
  subtitle:
    "Retrouvez l'ensemble des compétitions OW Women's Cup. Suivez les brackets, consultez les résultats et découvrez les équipes participantes.",
  tabAll: 'Tous',
  tabUpcoming: 'À venir',
  tabRunning: 'En cours',
  tabPast: 'Terminés',
  filterGame: 'Jeu',
  allGames: 'Tous les jeux',
  filterSearch: 'Rechercher',
  searchPlaceholder: 'Nom du tournoi…',
  tournamentCount_one: '{count} tournoi',
  tournamentCount_other: '{count} tournois',
  emptyTitle: 'Aucun tournoi disponible',
  emptyBody: 'Les prochains tournois seront annoncés bientôt.',
  noMatchTitle: 'Aucun tournoi ne correspond',
  noMatchBody: "Essayez d'élargir vos filtres pour voir plus de tournois.",
  resetFilters: 'Réinitialiser les filtres',
  cardRunning: 'En cours',
  cardUpcoming: 'À venir',
  cardPast: 'Terminé',
  teamsMax: '{count} équipes max',
  register: "S'inscrire",
  viewCard: 'Voir →',
  untilDate: "Jusqu'au {date}",
  loadErrorTitle: 'Impossible de charger les tournois',
  loadErrorBody:
    'Une erreur est survenue de notre côté. Réessayez dans quelques instants.',
  retry: 'Réessayer',
  filtersAriaLabel: 'Filtres des tournois',
  statusFilterAriaLabel: 'Filtrer par statut',
});
