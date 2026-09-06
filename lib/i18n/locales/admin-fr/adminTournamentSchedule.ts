// lib/i18n/locales/admin-fr/adminTournamentSchedule.ts
//
// Traductions FRANCAISES du namespace `adminTournamentSchedule` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` ; le garde-fou de compilation
// `../admin-parity.ts` casse le typecheck si une cle manque d'un cote.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentSchedule', {
  headTitle: 'Admin · Planning',
  eyebrow: 'Admin · Tournoi',
  pageTitle: 'Planning',
  subtitle:
    'Ce que le calendrier a de faux : contraintes d’équipe violées, équipes qui jouent deux fois, matchs hors des dates du tournoi, créneaux surchargés.',
  loading: 'Analyse du calendrier…',
  loadError: 'Analyse impossible.',
  refresh: 'Rafraîchir',

  allGood: 'Rien à signaler.',
  allGoodHint:
    'Aucune contrainte violée, aucune équipe qui joue deux fois, aucun match hors cadre.',
  noConstraints:
    'Aucune contrainte de disponibilité n’est déclarée pour ce tournoi. Le calendrier ne peut donc rien vérifier de ce côté — les contraintes se saisissent dans la fiche de chaque équipe.',

  blocking: 'Bloquant',
  warning: 'À regarder',
  info: 'Pour information',
  countMatches: '{count} matchs analysés',
  countConstraints: '{count} contraintes prises en compte',
  slotGrid: 'Créneaux pratiqués : {slots}',
  slotGridHint:
    'Déduits du calendrier lui-même — c’est parmi eux que les corrections sont cherchées.',

  suggestionLabel: 'Correction possible',
  suggestionMove: 'Déplacer à {time}',
  openMatch: 'Ouvrir le match',

  settings: 'Réglages de l’analyse',
  restLabel: 'Repos minimum entre deux matchs d’une équipe',
  restUnit: 'minutes',
  concurrentLabel: 'Matchs simultanés que la production porte',
  settingsHint:
    'Ces deux valeurs changent ce qui compte comme anomalie, jamais le calendrier.',

  viewList: 'Liste',
  viewMonth: 'Mois',
  viewLabel: 'Affichage',
  prevMonth: 'Mois précédent',
  nextMonth: 'Mois suivant',
  blockedDay: 'Indisponible',
  legendBlocking: 'Anomalie bloquante',
  legendWarning: 'À regarder',
  legendOk: 'Rien à signaler',
  legendBlocked: 'Jour d’indisponibilité',
  calendarEmpty: 'Aucun match daté à afficher.',

  applySuggestion: 'Appliquer',
  applyChecking: 'Calcul de l’impact…',
  applyTitle: 'Déplacer ce match ?',
  applySubtitle: '{label} → {time}',
  applyConfirm: 'Déplacer',
  impactFixed: 'Répare {count} anomalie(s)',
  impactBroken: 'En crée {count}',
  impactNone: 'Ne casse rien ailleurs.',
  impactBlocking: 'Attention : ce déplacement crée une anomalie BLOQUANTE.',
  moveDone: 'Match déplacé.',
  moveRefused: 'Déplacement refusé : il créerait une anomalie bloquante.',
  moveError: 'Déplacement impossible.',

  kindAvailability: 'Contrainte d’équipe',
  kindDoubleBooking: 'Deux matchs qui se chevauchent',
  kindSameEvening: 'Double soirée',
  kindOutsideTournament: 'Hors des dates du tournoi',
  kindSlotCollision: 'Créneau surchargé',
  kindUnscheduled: 'Match sans date',
});
