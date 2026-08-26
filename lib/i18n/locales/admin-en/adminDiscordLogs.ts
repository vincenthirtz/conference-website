// lib/i18n/locales/admin-en/adminDiscordLogs.ts
//
// Traductions ANGLAISES du namespace admin `adminDiscordLogs`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDiscordLogs.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Discord log',
  subtitlePlayer: 'Actions performed by players from Discord.',
  subtitleEvent: 'Events pushed by the website to the Discord bot.',
  countActions_one: '{count} action',
  countActions_other: '{count} actions',
  loading: 'Loading…',
  sourceLabel: 'Source',
  sourcePlayer: 'Player actions',
  sourceEvent: 'Outgoing events',
  sourceAriaLabel: 'Discord log source',
  labelAction: 'Action',
  allActions: 'All actions',
  labelEvent: 'Event',
  allEvents: 'All events',
  labelStatus: 'Delivery status',
  allStatuses: 'All statuses',
  statusPending: 'Pending',
  statusDelivered: 'Delivered',
  statusFailed: 'Failed',
  labelEntityType: 'Entity type',
  placeholderEntityType: 'team, match, invitation…',
  labelActor: 'Actor Discord ID',
  labelTarget: 'Target Discord ID',
  placeholderDiscordId: '123456789012345678',
  labelSearch: 'Search',
  placeholderSearch: 'Action, username, payload…',
  labelFrom: 'From',
  labelTo: 'To',
  filter: 'Filter',
  exportCsv: 'Export CSV',
  exporting: 'Exporting…',
  exportError: 'CSV export failed.',
  sortedByDate: 'Sorted by most recent',
  by: 'by',
  targetPrefix: 'target',
  attempts: '{count} attempt(s)',
  deliveredAt: 'Delivered on {date}',
  detailsPayload: 'View payload',
  empty: 'No Discord action matches these filters.',
  previous: 'Previous',
  next: 'Next',
  paginationTotal: ' of {total}',
};
