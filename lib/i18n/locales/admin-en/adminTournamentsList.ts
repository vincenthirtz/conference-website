// lib/i18n/locales/admin-en/adminTournamentsList.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin – Tournaments',
  pageTitle: 'Tournament management',
  tournamentCount_one: '{count} tournament',
  tournamentCount_other: '{count} tournaments',
  loading: 'Loading...',
  simulator: 'Simulator',
  newTournament: 'New tournament',
  searchLabel: 'Search',
  searchPlaceholder: 'Name or slug...',
  statusLabel: 'Status',
  allStatuses: 'All statuses',
  dateFromLabel: 'Start date (from)',
  dateToLabel: 'Start date (until)',
  searchButton: 'Search',
  retry: 'Retry',
  emptyTournaments: 'No tournaments found',
  badgePublic: 'Public',
  badgeFeatured: 'Featured',
  previous: 'Previous',
  paginationRange: '{from} – {to}',
  paginationOf: ' of {total}',
  next: 'Next',
  statusDraft: 'Draft',
  statusPublished: 'Published',
  statusRunning: 'Running',
  statusCompleted: 'Completed',
  statusArchived: 'Archived',
  statusUnknown: 'Unknown',
  formatSingleElim: 'Single Elim',
  formatDoubleElim: 'Double Elim',
  formatSwiss: 'Swiss',
  formatRoundRobin: 'Round Robin',
  formatShowmatch: 'Showmatch',
};
