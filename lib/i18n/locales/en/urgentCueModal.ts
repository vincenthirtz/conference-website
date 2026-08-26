// lib/i18n/locales/en/urgentCueModal.ts
//
// Traductions ANGLAISES du namespace `urgentCueModal`.
//
// La SOURCE DE VERITE est le francais (`../fr/urgentCueModal.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  ackFailed: 'Ack failed, try again.',
  urgent: 'URGENT',
  directorCue: 'Director cue',
  sending: 'Sending…',
  retry: 'Try again',
  seen: 'Seen',
  seenOffline: 'Seen (offline)',
  offlineHint:
    'Network unreachable. "Seen (offline)" saves your confirmation and sends it once the connection is back.',
};
