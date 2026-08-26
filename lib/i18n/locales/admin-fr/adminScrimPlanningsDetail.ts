// lib/i18n/locales/admin-fr/adminScrimPlanningsDetail.ts
//
// Traductions FRANCAISES du namespace `adminScrimPlanningsDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminScrimPlanningsDetail', {
  headTitle: '{title} – Grille de scrim',
  backAll: '← Toutes les grilles',
  untitled: 'Grille sans titre',
  loading: 'Chargement…',
  errorLoad: 'Erreur de chargement.',
  errorValidate: 'Erreur lors de la validation du créneau.',
  errorPatch: 'Erreur lors de la mise à jour.',
  teamsVs: '{team1} vs {team2}',
  openScrim: 'Ouvrir le scrim →',
  actionClose: 'Fermer la grille',
  actionCancel: 'Annuler la grille',
  cfgHorizon: 'Horizon',
  cfgHorizonValue: '{start} · {days} j',
  cfgBand: 'Bande horaire',
  cfgSlot: 'Granularité',
  cfgSlotValue: '{minutes} min',
  cfgTimezone: 'Fuseau',
  gridHeading: 'Disponibilités',
  statValidatable: 'Planifiables : {count}',
  statFullOverlap: 'Overlap parfait : {count}',
  validateHint:
    'Clique sur un créneau vert (les 2 équipes dispo) pour valider et créer le scrim.',
  readOnlyHint: 'Grille en lecture seule (déjà validée, fermée ou annulée).',
  notValidatable:
    "Ce créneau n'est pas planifiable (les 2 équipes doivent être dispo).",
  validatedBanner: 'Créneau validé : {when}',
  confirmValidateTitle: 'Valider ce créneau ?',
  confirmValidateSubtitle: 'Un scrim sera créé pour le {when}.',
  confirmValidateConfirm: 'Valider et créer le scrim',
  confirmValidateCancel: 'Annuler',
  validated: 'Créneau validé, scrim créé.',
  validatedWithWarning:
    "Scrim créé (attention : les 2 équipes n'étaient pas toutes dispo).",
  confirmCloseTitle: 'Fermer cette grille ?',
  confirmCloseSubtitle: 'La grille ne sera plus modifiable.',
  confirmCancelTitle: 'Annuler cette grille ?',
  confirmCancelSubtitle: 'Cette action est définitive.',
  closed: 'Grille fermée.',
  cancelled: 'Grille annulée.',
  gridLegendTitle: 'Disponibilités',
  gridAvailableCount: '{count} dispo',
  gridValidatable: 'Planifiable',
  gridFullOverlap: 'Overlap parfait',
  gridPaintHint: 'Clique-glisse pour peindre',
  gridCellLabel: 'Créneau {when}',
  gridEmpty: "Aucune disponibilité pour l'instant.",
  viewCalendar: 'Agenda',
  viewGrid: 'Grille',
  calWeekOf: 'Semaine du {date}',
  calPrevWeek: 'Semaine précédente',
  calNextWeek: 'Semaine suivante',
  calToday: "Aujourd'hui",
  confirmConflictTitle: 'Conflit de créneau',
  confirmConflictSubtitle:
    '{count} conflit(s) détecté(s) : une équipe est déjà prise à cette heure. Valider quand même ?',
  confirmConflictConfirm: 'Valider quand même',
  confirmValidateConflict:
    '⚠ {count} conflit(s) : une équipe est déjà prise à cette heure.',
  conflictBadge: '{count} conflit(s)',
  conflictBadgeTitle:
    'Une équipe est déjà prise à cette heure (scrim ou match).',
  participationHeading: 'Participation',
  partyTeam1: 'Équipe 1',
  partyTeam2: 'Équipe 2',
  partyStaff: 'Staff ({count})',
  painted: '✓',
  notPainted: '—',
  bestSlotHeading: 'Meilleur créneau suggéré',
  bestSlotValidate: 'Valider',
  bestSlotValidateBest: 'Valider le meilleur créneau',
  bestSlotFull: '3/3 dispo',
  bestSlotPartial: '2/3',
  noValidatableSlot: 'Aucun créneau où les deux équipes se recoupent.',
  extendWeek: "Prolonger d'une semaine",
  confirmExtendTitle: "Prolonger l'horizon ?",
  confirmExtendSubtitle:
    "La fenêtre de disponibilités sera allongée d'une semaine et le rappel sera réarmé.",
  extendConfirm: 'Prolonger',
  extended: "Horizon prolongé d'une semaine.",
  staffRequiredBadge: 'Staff requis',
  myAvailHeading: 'Mes disponibilités (staff)',
  myAvailHelp:
    "Indique tes créneaux en tant que staff ; ils comptent dans l'overlap ci-dessus.",
  myAvailSave: 'Enregistrer mes dispos',
  myAvailSaving: 'Enregistrement…',
  myAvailSaved: 'Tes disponibilités ont été enregistrées.',
  myAvailError: "Erreur lors de l'enregistrement de tes disponibilités.",
  myAvailCount: '{count} créneau(x)',
  myAvailClosed:
    "La grille n'est pas ouverte : tu ne peux plus modifier tes disponibilités.",
});
