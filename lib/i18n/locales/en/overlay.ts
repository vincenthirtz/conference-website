// lib/i18n/locales/en/overlay.ts
//
// Traductions ANGLAISES du namespace `overlay`.
//
// La SOURCE DE VERITE est le francais (`../fr/overlay.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  docTitle: 'Broadcast overlay',
  invalidRunId: 'Invalid run identifier.',
  connecting: 'Connecting to the control room…',
  live: 'Live',
  camera: 'Camera',
  sponsors: 'Partners',
  vs: 'VS',
  winner: 'Winner',
  logoAlt: '{name} logo',
  brandFallback: 'The competition',
  startingEyebrow: 'Starting soon',
  startingTitle: 'The stream is about to start',
  startingSubtitle: "Get comfy, it's coming.",
  pauseEyebrow: 'Intermission',
  pauseTitle: 'Break',
  pauseSubtitle: "We'll be right back.",
  endEyebrow: "That's a wrap",
  endTitle: 'Thanks for watching',
  customEyebrow: 'Live',
  resultTitle: 'Result',
  resultWithFormat: 'Result · {format}',
  resultNoMatchTitle: 'Match over',
};
