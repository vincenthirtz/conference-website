// lib/i18n/locales/en/cueFeed.ts
//
// Traductions ANGLAISES du namespace `cueFeed`.
//
// La SOURCE DE VERITE est le francais (`../fr/cueFeed.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  sevInfo: 'Info',
  sevWarn: 'Warning',
  sevUrgent: 'URGENT',
  justNow: 'just now',
  secondsAgo: '{count}s ago',
  minutesAgo: '{count}min ago',
  hoursAgo: '{count}h ago',
  daysAgo: '{count}d ago',
  directorCues: 'Director cues',
  emptyBody: 'No cue for now.',
  seen: 'Seen',
  sending: 'Sending…',
  markSeen: 'Mark as seen',
  retractedBadge: 'Cancelled',
};
