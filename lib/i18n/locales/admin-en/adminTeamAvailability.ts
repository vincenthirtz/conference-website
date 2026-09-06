// lib/i18n/locales/admin-en/adminTeamAvailability.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamAvailability`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamAvailability.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure,
// sans quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Availability',
  subtitle:
    'When the team is allowed to play. Read by the schedule diagnostics and the auto-scheduler.',
  loading: 'Loading…',
  empty: 'No constraint declared.',
  emptyHint:
    'Until something is declared, the platform assumes every slot works.',
  addButton: 'Add a constraint',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving…',
  deleteAction: 'Delete',
  deleteTitle: 'Delete constraint',
  deleteBody:
    'The schedule will stop checking it. Matches already placed will not move.',
  deleteConfirm: 'Delete',

  kindLabel: 'Kind',
  kindBlackout: 'Unavailable over a period',
  kindEarliest: 'No match before…',
  kindLatest: 'No match after…',
  kindWeekday: 'Unavailable on certain weekdays',

  startsOn: 'From',
  endsOn: 'To',
  timeOfDay: 'Time',
  weekdays: 'Days',
  timezone: 'Time zone',
  timezoneHint: 'Times and dates are read in this zone, not in UTC.',
  scope: 'Scope',
  scopeAll: 'All tournaments',
  scopeAllHint: 'A standing rule for the team.',
  note: 'Note',
  notePlaceholder: 'What the team wrote, and how long it holds.',
  noteHint:
    'This is the field you will re-read in six months to know whether the rule still holds.',

  scopeBadgeAll: 'all tournaments',
  errorGeneric: 'Could not save.',
  errorRange: 'The end date precedes the start date.',
  addedToast: 'Constraint added.',
  deletedToast: 'Constraint deleted.',

  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};
