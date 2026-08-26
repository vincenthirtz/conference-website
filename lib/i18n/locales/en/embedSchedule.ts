// lib/i18n/locales/en/embedSchedule.ts
//
// Traductions ANGLAISES du namespace `embedSchedule`.
//
// La SOURCE DE VERITE est le francais (`../fr/embedSchedule.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Schedule',
  empty: 'No matches scheduled for this tournament.',
  viewOn: 'View on {site}',
  vs: 'vs',
  tbd: 'TBD',
  statusUpcoming: 'Upcoming',
  statusLive: 'Live',
  statusDone: 'Done',
};
