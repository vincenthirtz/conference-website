// lib/i18n/locales/en/liveTwitchSection.ts
//
// Traductions ANGLAISES du namespace `liveTwitchSection`.
//
// La SOURCE DE VERITE est le francais (`../fr/liveTwitchSection.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  defaultEyebrow: 'Live',
  defaultTitle: 'While waiting for the competition',
  defaultSubtitle:
    'Find our partner channels, casts and analysis while waiting for the competition.',
  liveNow: 'Live now',
  offline: 'Offline',
  descFallback: 'OW streams, analysis and live casts. Follow {label}.',
  statusUpdating: 'Updating status…',
  viewChannel: 'View channel',
  prev: '← Previous',
  next: 'Next →',
  page: 'Page {current} / {total}',
};
