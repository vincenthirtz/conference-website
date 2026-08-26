// lib/i18n/locales/en/tournamentArbitration.ts
//
// Traductions ANGLAISES du namespace `tournamentArbitration`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentArbitration.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Arbitration & disputes',
  description: 'Transparency on how disputes are resolved in this tournament.',
  statTotalDisputes: 'Disputes',
  statResolved: 'Resolved',
  statOpen: 'Open',
  statMedianResolution: 'Median resolution',
  statSlaCompliance: 'SLA compliance',
  avgHint: 'Average: {value}',
  slaTarget: 'SLA: {minutes} min',
  withinSlaHint: '{count} within SLA',
  na: 'n/a',
  openBreakdownHeading: 'Open disputes breakdown',
  breached: 'Overdue',
  approaching: 'Nearing SLA',
  fresh: 'On time',
  noDisputesTitle: 'No disputes',
  noDisputesText: 'All clear — no disputes to arbitrate.',
  durationMinutes: '{count} min',
  durationHours: '{hours} h {minutes} min',
  durationHoursOnly: '{hours} h',
  loading: 'Loading arbitration data…',
};
