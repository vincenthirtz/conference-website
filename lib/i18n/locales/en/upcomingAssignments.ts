// lib/i18n/locales/en/upcomingAssignments.ts
//
// Traductions ANGLAISES du namespace `upcomingAssignments`.
//
// La SOURCE DE VERITE est le francais (`../fr/upcomingAssignments.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Your next assignments',
  emptyBody:
    'No cast assignment in the next 24h. Come back later or contact the Director.',
  scrim: 'Scrim',
  match: 'Match',
  notScheduled: 'Not scheduled',
  roleFallback: 'Caster',
  vs: 'vs',
  stream: 'Stream',
  now: 'now',
  inMinutes: 'in {count} min',
  agoMinutes: '{count} min ago',
  inHours: 'in {count}h',
  agoHours: '{count}h ago',
  inDays: 'in {count}d',
  agoDays: '{count}d ago',
};
