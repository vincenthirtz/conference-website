// lib/i18n/locales/admin-fr/adminScrimPlanningsCreate.ts
//
// Traductions FRANCAISES du namespace `adminScrimPlanningsCreate` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminScrimPlanningsCreate', {
  heading: 'Nouvelle grille de scrim',
  subtitle: 'Génère une grille de disponibilités partagée entre deux équipes.',
  team1Label: 'Équipe 1',
  team2Label: 'Équipe 2',
  teamPlaceholder: '— Choisir —',
  titleLabel: 'Titre',
  titlePlaceholder: 'Scrim amical',
  gameLabel: 'Jeu',
  horizonStartLabel: "Début de l'horizon",
  horizonDaysLabel: 'Nombre de jours',
  slotMinutesLabel: 'Granularité',
  slot30: '30 min',
  slot60: '60 min',
  dayStartLabel: 'Début de journée',
  dayEndLabel: 'Fin de journée',
  timezoneLabel: 'Fuseau horaire',
  timezoneCommon: 'Fréquents',
  timezoneAll: 'Tous les fuseaux',
  submit: 'Créer la grille',
  submitting: 'Création…',
  cancel: 'Annuler',
  created: 'Grille créée.',
  errorTeamsRequired: 'Les deux équipes sont obligatoires.',
  errorTeamsDistinct: 'Les deux équipes doivent être distinctes.',
  errorTimeBand: 'La fin de journée doit être après le début.',
  errorCreate: 'Erreur de création.',
  errorDuplicateDemande: 'Une grille existe déjà pour cette demande de scrim.',
  staffRequiredLabel: 'Staff requis',
  staffRequiredHelp:
    'Un créneau ne sera planifiable que si le staff est aussi disponible (les 3 parties).',
});
