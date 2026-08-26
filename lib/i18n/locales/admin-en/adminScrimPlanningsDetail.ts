// lib/i18n/locales/admin-en/adminScrimPlanningsDetail.ts
//
// Traductions ANGLAISES du namespace admin `adminScrimPlanningsDetail`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminScrimPlanningsDetail.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: '{title} – Scrim grid',
  backAll: '← All grids',
  untitled: 'Untitled grid',
  loading: 'Loading…',
  errorLoad: 'Loading error.',
  errorValidate: 'Error while validating the slot.',
  errorPatch: 'Error while updating.',
  teamsVs: '{team1} vs {team2}',
  openScrim: 'Open scrim →',
  actionClose: 'Close grid',
  actionCancel: 'Cancel grid',
  cfgHorizon: 'Horizon',
  cfgHorizonValue: '{start} · {days} d',
  cfgBand: 'Time band',
  cfgSlot: 'Granularity',
  cfgSlotValue: '{minutes} min',
  cfgTimezone: 'Timezone',
  gridHeading: 'Availability',
  statValidatable: 'Schedulable: {count}',
  statFullOverlap: 'Full overlap: {count}',
  validateHint:
    'Click a green slot (both teams available) to validate and create the scrim.',
  readOnlyHint: 'Read-only grid (already validated, closed or cancelled).',
  notValidatable:
    'This slot is not schedulable (both teams must be available).',
  validatedBanner: 'Validated slot: {when}',
  confirmValidateTitle: 'Validate this slot?',
  confirmValidateSubtitle: 'A scrim will be created for {when}.',
  confirmValidateConfirm: 'Validate and create scrim',
  confirmValidateCancel: 'Cancel',
  validated: 'Slot validated, scrim created.',
  validatedWithWarning:
    'Scrim created (warning: not all teams were available).',
  confirmCloseTitle: 'Close this grid?',
  confirmCloseSubtitle: 'The grid will no longer be editable.',
  confirmCancelTitle: 'Cancel this grid?',
  confirmCancelSubtitle: 'This action is final.',
  closed: 'Grid closed.',
  cancelled: 'Grid cancelled.',
  gridLegendTitle: 'Availability',
  gridAvailableCount: '{count} available',
  gridValidatable: 'Schedulable',
  gridFullOverlap: 'Full overlap',
  gridPaintHint: 'Click and drag to paint',
  gridCellLabel: 'Slot {when}',
  gridEmpty: 'No availability yet.',
  viewCalendar: 'Calendar',
  viewGrid: 'Grid',
  calWeekOf: 'Week of {date}',
  calPrevWeek: 'Previous week',
  calNextWeek: 'Next week',
  calToday: 'Today',
  confirmConflictTitle: 'Slot conflict',
  confirmConflictSubtitle:
    '{count} conflict(s) detected: a team is already booked at this time. Validate anyway?',
  confirmConflictConfirm: 'Validate anyway',
  confirmValidateConflict:
    '⚠ {count} conflict(s): a team is already booked at this time.',
  conflictBadge: '{count} conflict(s)',
  conflictBadgeTitle: 'A team is already booked at this time (scrim or match).',
  participationHeading: 'Participation',
  partyTeam1: 'Team 1',
  partyTeam2: 'Team 2',
  partyStaff: 'Staff ({count})',
  painted: '✓',
  notPainted: '—',
  bestSlotHeading: 'Suggested best slot',
  bestSlotValidate: 'Validate',
  bestSlotValidateBest: 'Validate the best slot',
  bestSlotFull: '3/3 available',
  bestSlotPartial: '2/3',
  noValidatableSlot: 'No slot where both teams overlap.',
  extendWeek: 'Extend by one week',
  confirmExtendTitle: 'Extend the horizon?',
  confirmExtendSubtitle:
    'The availability window will be extended by one week and the reminder will be re-armed.',
  extendConfirm: 'Extend',
  extended: 'Horizon extended by one week.',
  staffRequiredBadge: 'Staff required',
  myAvailHeading: 'My availability (staff)',
  myAvailHelp: 'Set your slots as staff; they count toward the overlap above.',
  myAvailSave: 'Save my availability',
  myAvailSaving: 'Saving…',
  myAvailSaved: 'Your availability has been saved.',
  myAvailError: 'Error while saving your availability.',
  myAvailCount: '{count} slot(s)',
  myAvailClosed:
    'The grid is not open: you can no longer edit your availability.',
};
