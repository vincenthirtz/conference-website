// lib/i18n/locales/admin-en/adminLogs.ts
//
// Traductions ANGLAISES du namespace admin `adminLogs`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminLogs.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Staff logs',
  backToDashboard: 'Back to admin dashboard',
  heading: 'Staff logs',
  countActions_one: '{count} action recorded',
  countActions_other: '{count} actions recorded',
  loading: 'Loading...',
  sortedByDate: 'Sorted by date, newest first',
  labelEntityType: 'Entity type',
  placeholderEntityType: 'tournament, stage, match...',
  labelAction: 'Action',
  placeholderAction: 'create_match, update_stage...',
  allActions: 'All actions',
  labelStaff: 'Staff',
  placeholderStaff: 'ID or name',
  labelTournament: 'Tournament',
  allTournaments: 'All tournaments',
  labelSearch: 'Search',
  placeholderSearch: 'message, payload...',
  filter: 'Filter',
  labelStageId: 'Stage ID',
  placeholderStage: 'stage...',
  labelMatchId: 'Match ID',
  placeholderMatch: 'match...',
  labelTeamId: 'Team ID',
  placeholderTeam: 'team...',
  labelFrom: 'From',
  labelTo: 'To',
  empty: 'No logs found for these filters',
  by: 'by',
  tagTournament: 'Tournament: {id}',
  tagStage: 'Stage: {id}',
  tagMatch: 'Match: {id}',
  tagTeam: 'Team: {id}',
  detailsPayload: 'Details (payload)',
  exportCsv: 'Export CSV',
  exporting: 'Exporting…',
  exportError: 'CSV export failed',
  linkEntity: 'Open',
  linkTournament: 'Tournament',
  linkStage: 'Stage',
  linkMatch: 'Match',
  linkTeam: 'Team',
  previous: 'Previous',
  next: 'Next',
  paginationTotal: ' of {total}',
  errorUnexpected: 'Unexpected error',
};
