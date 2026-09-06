// lib/i18n/locales/admin-en/adminTournamentSchedule.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentSchedule`.
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentSchedule.ts`).
// Ne PAS annoter `as const` : la parite se verifie contre le francais.

export default {
  headTitle: 'Admin · Schedule',
  eyebrow: 'Admin · Tournament',
  pageTitle: 'Schedule',
  subtitle:
    'What the calendar gets wrong: broken team constraints, teams playing twice, matches outside the tournament dates, overloaded slots.',
  loading: 'Analysing the schedule…',
  loadError: 'Could not analyse.',
  refresh: 'Refresh',

  allGood: 'Nothing to report.',
  allGoodHint:
    'No constraint broken, no team playing twice, no match out of frame.',
  noConstraints:
    'No availability constraint is declared for this tournament, so the schedule cannot check anything on that front — constraints are entered on each team page.',

  blocking: 'Blocking',
  warning: 'Worth a look',
  info: 'For information',
  countMatches: '{count} matches analysed',
  countConstraints: '{count} constraints taken into account',
  slotGrid: 'Slots in use: {slots}',
  slotGridHint:
    'Derived from the schedule itself — fixes are looked for among them.',

  suggestionLabel: 'Possible fix',
  suggestionMove: 'Move to {time}',
  openMatch: 'Open match',

  settings: 'Analysis settings',
  restLabel: 'Minimum rest between two matches for one team',
  restUnit: 'minutes',
  concurrentLabel: 'Concurrent matches the production can carry',
  settingsHint:
    'These two values change what counts as an anomaly, never the schedule.',

  kindAvailability: 'Team constraint',
  kindDoubleBooking: 'Overlapping matches',
  kindSameEvening: 'Two matches in one evening',
  kindOutsideTournament: 'Outside tournament dates',
  kindSlotCollision: 'Overloaded slot',
  kindUnscheduled: 'Match with no date',
};
