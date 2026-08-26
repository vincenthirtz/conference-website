// lib/i18n/locales/admin-en/adminMatchTimeline.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchTimeline`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchTimeline.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  scoreWithPrev: 'Score: {prev} → {next}',
  scoreOnly: 'Score: {next}',
  forfeit: 'Forfeit',
  cancel: 'Cancellation',
  delete: 'Deletion',
  meta: 'Metadata',
  loading: 'Loading history…',
  errorLoad: 'Unable to load history',
  errorNetwork: 'Network error',
  empty: 'No action recorded.',
  more: '+{count} earlier action(s)',
};
