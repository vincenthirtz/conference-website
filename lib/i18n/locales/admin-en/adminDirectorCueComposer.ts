// lib/i18n/locales/admin-en/adminDirectorCueComposer.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorCueComposer`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorCueComposer.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  cueUrgentSent: 'Urgent cue sent. Awaiting ack.',
  cueSent: 'Cue sent.',
  sendFailed: 'Send failed.',
  severityAria: 'Cue severity',
  severityItemAria: 'Severity {label}',
  cueTextLabel: 'Cue text',
  placeholderLive: 'E.g.: cutting the ad in 30s, resuming match 2',
  placeholderIdle: 'The run must be live to send a cue.',
  keyMac: '⌘ + Enter',
  keyOther: 'Ctrl + Enter',
  toSend: 'to send',
  sendAria: 'Send the cue',
  sending: 'Sending…',
  send: 'Send',
  ackNote: 'Ack required — casters will have to click Seen.',
  startNote: 'Start the run to send cues.',
};
