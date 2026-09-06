// lib/i18n/locales/admin-fr/adminTeamAvailability.ts
//
// Traductions FRANCAISES du namespace `adminTeamAvailability` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts`.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamAvailability', {
  title: 'Disponibilités',
  subtitle:
    "Quand l'équipe a le droit de jouer. Lu par le diagnostic de planning et par l'auto-scheduler.",
  loading: 'Chargement…',
  empty: 'Aucune contrainte déclarée.',
  emptyHint:
    "Tant que rien n'est déclaré, la plateforme considère que tous les créneaux conviennent.",
  addButton: 'Ajouter une contrainte',
  cancel: 'Annuler',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  deleteAction: 'Supprimer',
  deleteTitle: 'Supprimer la contrainte',
  deleteBody:
    'Le calendrier ne la vérifiera plus. Les matchs déjà placés ne bougent pas.',
  deleteConfirm: 'Supprimer',

  kindLabel: 'Nature',
  kindBlackout: 'Indisponible sur une période',
  kindEarliest: 'Pas de match avant…',
  kindLatest: 'Pas de match après…',
  kindWeekday: 'Indisponible certains jours de la semaine',

  startsOn: 'Du',
  endsOn: 'Au',
  timeOfDay: 'Heure',
  weekdays: 'Jours',
  timezone: 'Fuseau',
  timezoneHint:
    'Les heures et les dates sont lues dans ce fuseau, pas en UTC.',
  scope: 'Portée',
  scopeAll: 'Tous les tournois',
  scopeAllHint: 'Une règle permanente de l’équipe.',
  note: 'Note',
  notePlaceholder: 'Ce que l’équipe a écrit, et jusqu’à quand ça vaut.',
  noteHint:
    'Ce champ est ce qu’on relira dans six mois pour savoir si la règle tient toujours.',

  scopeBadgeAll: 'tous tournois',
  errorGeneric: 'Enregistrement impossible.',
  errorRange: 'La date de fin précède la date de début.',
  addedToast: 'Contrainte ajoutée.',
  deletedToast: 'Contrainte supprimée.',

  monday: 'lundi',
  tuesday: 'mardi',
  wednesday: 'mercredi',
  thursday: 'jeudi',
  friday: 'vendredi',
  saturday: 'samedi',
  sunday: 'dimanche',
});
