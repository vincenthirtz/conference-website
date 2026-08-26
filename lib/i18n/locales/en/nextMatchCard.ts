// lib/i18n/locales/en/nextMatchCard.ts
//
// Traductions ANGLAISES du namespace `nextMatchCard`.
//
// La SOURCE DE VERITE est le francais (`../fr/nextMatchCard.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  nextMatch: 'Next match',
  live: 'Live',
  viewMatch: 'View match',
  liveCast: 'Live cast',
  checkedIn: 'Checked in',
  checkinClosed: 'Check-in closed',
  checkinNow: 'Check in now',
  checkin: 'Check-in',
  soon: 'soon',
  noDate: '—',
  inFmt: 'in {parts}',
  agoFmt: '{parts} ago',
  lessThanMin: 'less than 1 min',
  days: '{n}d',
  hours: '{n}h',
  mins: '{n}min',
  emptyTitle: 'No upcoming match',
  emptyBody: 'Your next scheduled match will show up here along with check-in.',
  loadErrorShort: "Couldn't load your next match right now.",
  scoutOpponent: 'Scout the opponent',
};
