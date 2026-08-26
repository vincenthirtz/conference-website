// lib/i18n/locales/admin-en/adminDirectorRunStatusHeader.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorRunStatusHeader`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorRunStatusHeader.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  slugLabel: 'Slug:',
  dateLabel: 'Date:',
  startedLabel: 'Started:',
  endedLabel: 'Ended:',
  segmentsLabel: 'segments',
  segmentsDone: 'done',
  driftGaugeAria: 'Planned vs actual drift gauge',
  driftTitle: 'Planned: {planned} — Actual: {real}',
  startRun: 'Start the run',
  endRun: 'End the run',
  runDone: 'Run finished',
};
