// lib/i18n/locales/admin-en/adminStageHistory.ts
//
// Traductions ANGLAISES du namespace admin `adminStageHistory`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStageHistory.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errLoadHistory: 'Unable to load history',
  errUnknown: 'Unknown error',
  pageTitle: 'Admin – Stage history',
  back: '← Back to stage',
  heading: 'Stage staff history',
  subtitle:
    'Log of staff actions related to this stage (stages, matches, etc.).',
  entityTypeLabel: 'Entity type (entity_type)',
  entityTypePlaceholder: 'e.g. "stage", "match", "team"...',
  actionLabel: 'Action',
  actionPlaceholder: 'e.g. "create_match", "update_stage"...',
  limitLabel: 'Limit',
  filter: 'Filter',
  loading: 'Loading...',
  logsCount: 'Logs ({count})',
  sortedHint: 'Sorted from newest to oldest',
  emptyLogs: 'No logs found for these filters.',
  by: 'by',
  payloadDetails: 'Details (payload)',
  openMatch: 'Open match',
  openStage: 'Open stage',
  openTeam: 'Open team',
  openTournament: 'Open tournament',
};
