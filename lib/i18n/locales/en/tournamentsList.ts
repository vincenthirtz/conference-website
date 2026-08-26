// lib/i18n/locales/en/tournamentsList.ts
//
// Traductions ANGLAISES du namespace `tournamentsList`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentsList.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badgeCompetition: 'Competition',
  title: 'All tournaments',
  subtitle:
    "Find every OW Women's Cup competition. Follow the brackets, check the results and discover the participating teams.",
  tabAll: 'All',
  tabUpcoming: 'Upcoming',
  tabRunning: 'Live',
  tabPast: 'Finished',
  filterGame: 'Game',
  allGames: 'All games',
  filterSearch: 'Search',
  searchPlaceholder: 'Tournament name…',
  tournamentCount_one: '{count} tournament',
  tournamentCount_other: '{count} tournaments',
  emptyTitle: 'No tournament available',
  emptyBody: 'The next tournaments will be announced soon.',
  noMatchTitle: 'No tournament matches',
  noMatchBody: 'Try broadening your filters to see more tournaments.',
  resetFilters: 'Reset filters',
  cardRunning: 'Live',
  cardUpcoming: 'Upcoming',
  cardPast: 'Finished',
  teamsMax: '{count} teams max',
  register: 'Register',
  viewCard: 'View →',
  untilDate: 'Until {date}',
  loadErrorTitle: 'Unable to load the tournaments',
  loadErrorBody:
    'Something went wrong on our side. Please try again in a moment.',
  retry: 'Try again',
  filtersAriaLabel: 'Tournament filters',
  statusFilterAriaLabel: 'Filter by status',
};
