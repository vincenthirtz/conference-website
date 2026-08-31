// lib/i18n/locales/en/tournamentMatches.ts
//
// Traductions ANGLAISES du namespace `tournamentMatches`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentMatches.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: "Matches – {name} | OW Women's Cup",
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  statusCancelled: 'Cancelled',
  heading: 'Matches – {name}',
  description:
    'Find here the full list of tournament matches. Use the filters to browse by stage or by status (upcoming, ongoing, finished).',
  printIntro:
    'Full match schedule. This document reflects the list as it was filtered at print time.',
  backToTournament: '← Back to tournament',
  viewBracket: 'View bracket',
  topMaps: 'Top maps',
  filtersLabel: 'Filters',
  statusFilterLabel: 'Status:',
  filterAll: 'All',
  filterUpcoming: 'Upcoming',
  filterOngoing: 'Ongoing',
  filterFinished: 'Finished',
  stageFilterLabel: 'Stage:',
  filterAllStages: 'All',
  resetFilters: 'Reset',
  viewToggleLabel: 'View mode',
  viewList: 'List',
  viewAgenda: 'Agenda',
  viewMonth: 'Month',
  monthPrev: 'Previous month',
  monthNext: 'Next month',
  monthToday: 'Today',
  moreEvents: '+{count} more',
  monthCollapse: 'Collapse',
  monthUnscheduled_one:
    '{count} match without a set date (not shown on the grid).',
  monthUnscheduled_other:
    '{count} matches without a set date (not shown on the grid).',
  timezoneNote: 'Times shown in Paris time (CET/CEST).',
  calendarLabel: 'Add the schedule to my calendar',
  calendarDownload: 'Download .ics',
  calendarSubscribe: 'Subscribe (webcal)',
  noMatchesFilter: 'No match matches the current filters.',
  matchesCount_one: '{count} match',
  matchesCount_other: '{count} matches',
  dateTbd: 'Date to be defined',
  timeTbd: 'Time to be confirmed',
  vsLabel: 'vs',
  byeLabel: '(bye)',
  pairingTbd: 'Matchup to be determined',
  teamPlaceholder1: 'Team 1',
  teamPlaceholder2: 'Team 2',
};
