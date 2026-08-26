// lib/i18n/locales/admin-en/adminDashboardSupportTicketsDonut.ts
//
// Traductions ANGLAISES du namespace admin `adminDashboardSupportTicketsDonut`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDashboardSupportTicketsDonut.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  catDispute: 'Disputes',
  catBehavior: 'Behavior',
  catTechnical: 'Technical',
  catOther: 'Other',
  noTickets: 'No open tickets.',
  open: 'open',
  severityLabel: 'Severity:',
  sevHigh: 'High {pct}%',
  sevMedium: 'Medium {pct}%',
  sevLow: 'Low {pct}%',
};
