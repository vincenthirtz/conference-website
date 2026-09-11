// lib/i18n/locales/admin-en/adminTeamExport.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamExport`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamExport.ts`) : toute
// cle ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans
// quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  groupLabel: 'Export teams',
  exportCsv: 'Export CSV',
  exportPdf: 'Export PDF',
  csvExporting: 'Exporting…',
  csvHintList:
    'Downloads a CSV of every team matching the current filters (not just the current page)',
  csvHintTeam: 'Downloads a CSV of this team',
  pdfHintList:
    'Opens a printable version of the filtered teams in a new tab ("Save as PDF" in the print dialog)',
  pdfHintTeam:
    'Opens a printable version of this team in a new tab ("Save as PDF" in the print dialog)',
  csvDone: 'CSV export downloaded',
  csvError: 'CSV export failed: {message}',
  csvHttpError: 'error {status}',
  headTitle: 'Admin – Teams export',
  titleAll: 'All teams',
  titleTournament: 'Teams — {name}',
  titleTeamFallback: 'Team',
  generatedAt: 'Generated on {date}',
  dateLocale: 'en-GB',
  teamCount_one: '{count} team',
  teamCount_other: '{count} teams',
  filtersPrefix: 'Filters: ',
  filterSearch: 'search "{q}"',
  filterActive: 'active',
  filterInactive: 'inactive',
  truncated:
    'Truncated export: not every team could be included. Narrow the filters (tournament, search) to get a complete list.',
  loading: 'Preparing the export…',
  loadError: 'Could not load the export: {message}',
  retry: 'Retry',
  emptyTitle: 'No teams to export',
  emptyDesc: 'No team matches these criteria.',
  backToList: '← Back to the teams list',
  backToTeam: '← Back to the team page',
  roster: 'Roster',
  subs: 'Substitutes',
  staff: 'Staff',
  none: 'No members',
  colPseudo: 'Nickname',
  colBattleTag: 'BattleTag',
  colDiscord: 'Discord',
  colRole: 'Role / position',
  captain: 'Captain',
  registration: 'Registration: {status}',
  regStatus: {
    registered: 'registered',
    pending: 'pending',
    confirmed: 'confirmed',
    checked_in: 'checked in',
    waitlist: 'waitlist',
    withdrawn: 'withdrawn',
    rejected: 'rejected',
    disqualified: 'disqualified',
  },
  specialty: {
    tank: 'Tank',
    dps: 'DPS',
    support: 'Support',
    flex: 'Flex',
  },
};
