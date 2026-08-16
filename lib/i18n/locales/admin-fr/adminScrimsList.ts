// lib/i18n/locales/admin-fr/adminScrimsList.ts
//
// Traductions FRANCAISES du namespace `adminScrimsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminScrimsList', {
  pageTitle: 'Admin – Scrims',
  heading: 'Gestion des scrims',
  subtitle: 'Sessions de matchs amicaux entre 2 équipes.',
  newScrim: '+ Nouveau scrim',
  tabsAriaLabel: 'Sections des scrims',
  tabScrims: 'Scrims',
  tabPlannings: 'Grilles de planification',
  statusFilterLabel: 'Statut',
  filterAll: 'Tous',
  statusDraft: 'Brouillon',
  statusScheduled: 'Planifié',
  statusRunning: 'En cours',
  statusCompleted: 'Terminé',
  statusCancelled: 'Annulé',
  errorLoad: 'Erreur de chargement.',
  loading: 'Chargement…',
  empty: 'Aucun scrim pour ce filtre.',
  publicBadge: '• Public',
  teamsVs: '{team1} vs {team2}',
  tabCalendar: 'Agenda',
  calToday: "Aujourd'hui",
  calPrevWeek: 'Semaine précédente',
  calNextWeek: 'Semaine suivante',
  calThisWeek: 'Cette semaine',
  calWeekOf: 'Semaine du {date}',
  calCreateHint: 'Clique sur un créneau pour créer un scrim',
  calViewWeek: 'Semaine',
  calViewMonth: 'Mois',
  calMatchTag: 'Match',
  calMonthPrev: 'Mois précédent',
  calMonthNext: 'Mois suivant',
  calFilterTeam: 'Équipe',
  calFilterStatus: 'Statut',
  calFilterAllTeams: 'Toutes les équipes',
  calConflictWarning: 'Créneau en conflit avec une équipe déjà prise.',
  calRescheduled: 'Scrim replanifié.',
  calResized: 'Durée du scrim mise à jour.',
  calMoreEvents: '+{count}',
  calCollapse: '− réduire',
  calUpdateError: 'Impossible de mettre à jour le scrim.',
});
