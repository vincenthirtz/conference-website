// lib/i18n/locales/admin-en/adminTournamentHistory.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentHistory`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentHistory.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Tournament history',
  backToTournament: '← Back to tournament',
  heading: 'Tournament staff history',
  intro:
    'Log of staff actions (create / update / batch, etc.) on this tournament and its linked entities.',
  labelEntityType: 'Entity type (entity_type)',
  placeholderEntityType: 'e.g. "tournament", "match", "stage"...',
  labelAction: 'Action',
  placeholderAction: 'e.g. "update_tournament", "create_match"...',
  labelLimit: 'Limit',
  filter: 'Filter',
  loading: 'Loading...',
  logsCount: 'Logs ({count})',
  sortedNewestFirst: 'Sorted newest to oldest',
  empty: 'No logs found for these filters.',
  by: 'by',
  detailsPayload: 'Details (payload)',
  openMatch: 'Open match',
  openStage: 'Open stage',
  openTeam: 'Open team',
  errorLoad: "Couldn't load the history",
  errorUnknown: 'Unknown error',
};
