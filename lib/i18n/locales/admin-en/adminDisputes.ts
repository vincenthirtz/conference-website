// lib/i18n/locales/admin-en/adminDisputes.ts
//
// Traductions ANGLAISES du namespace admin `adminDisputes`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDisputes.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Open disputes',
  heading: 'Open disputes',
  introPrefix: 'Cross-tournament board with SLA. A dispute in',
  introSuffix:
    'has exceeded the SLA window and triggered a Discord escalation (or is about to). Sorted by descending age by default.',
  refresh: 'Refresh',
  statTotal: 'Total',
  statBreached: 'Breached',
  statApproaching: 'Approaching',
  statFresh: 'Fresh',
  tournamentLabel: 'Tournament:',
  tournamentAll: '— All —',
  resultsCount: '{count} result(s)',
  shownCount: '{count} shown',
  autoRefresh: '· auto-refresh 60s',
  errorLoad: 'Loading error',
  loading: 'Loading…',
  empty: 'No {filter} disputes yet. ✨',
  prev: '← Previous',
  next: 'Next →',
  paginationRange: '{from} – {to}',
  paginationOf: ' of {total}',
  slaLine: '/ SLA {min} min',
  escalated: '· escalated ✉️',
  vs: 'vs',
  resolve: 'Resolve →',
};
