// lib/i18n/locales/en/regieStartPrepared.ts
//
// Traductions ANGLAISES du namespace `regieStartPrepared`.
//
// La SOURCE DE VERITE est le francais (`../fr/regieStartPrepared.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Start a prepared run',
  description:
    'Launch a run already built with its segments, without starting from scratch.',
  directorHint: 'A run’s segments are assembled and edited in the Director.',
  loading: 'Loading prepared runs…',
  loadError: 'Could not load prepared runs.',
  noSchedule: 'No date',
  start: 'Start',
  starting: 'Starting…',
  startSuccess: 'Run started.',
  startError: 'Could not start the run.',
};
