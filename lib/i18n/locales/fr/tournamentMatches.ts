// lib/i18n/locales/fr/tournamentMatches.ts
//
// Traductions FRANCAISES du namespace `tournamentMatches` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentMatches', {
  headTitle: "Matchs – {name} | OW Women's Cup",
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  statusCancelled: 'Annulé',
  heading: 'Matchs – {name}',
  description:
    'Retrouvez ici la liste complète des matchs du tournoi. Utilisez les filtres pour naviguer par phase ou par statut (à venir, en cours, terminés).',
  printIntro:
    'Calendrier complet des rencontres. Ce document reprend la liste telle qu’elle était filtrée au moment de l’impression.',
  backToTournament: '← Retour au tournoi',
  viewBracket: 'Voir le bracket',
  topMaps: 'Top maps',
  filtersLabel: 'Filtres',
  statusFilterLabel: 'Statut :',
  filterAll: 'Tous',
  filterUpcoming: 'À venir',
  filterOngoing: 'En cours',
  filterFinished: 'Terminés',
  stageFilterLabel: 'Phase :',
  filterAllStages: 'Toutes',
  resetFilters: 'Réinitialiser',
  viewToggleLabel: "Mode d'affichage",
  viewList: 'Liste',
  viewAgenda: 'Agenda',
  viewMonth: 'Mois',
  monthPrev: 'Mois précédent',
  monthNext: 'Mois suivant',
  monthToday: "Aujourd'hui",
  moreEvents: '+{count} de plus',
  monthCollapse: 'Réduire',
  monthUnscheduled_one:
    '{count} match sans date définie (non affiché sur la grille).',
  monthUnscheduled_other:
    '{count} matchs sans date définie (non affichés sur la grille).',
  timezoneNote: 'Horaires affichés en heure de Paris (CET/CEST).',
  calendarLabel: "Ajouter l'agenda à mon calendrier",
  calendarDownload: 'Télécharger .ics',
  calendarSubscribe: "S'abonner (webcal)",
  noMatchesFilter: 'Aucun match ne correspond aux filtres actuels.',
  matchesCount_one: '{count} match',
  matchesCount_other: '{count} matchs',
  dateTbd: 'Date à définir',
  timeTbd: 'Horaire à confirmer',
  vsLabel: 'vs',
  byeLabel: '(bye)',
  pairingTbd: 'Affiche à déterminer',
  teamPlaceholder1: 'Équipe 1',
  teamPlaceholder2: 'Équipe 2',
});
