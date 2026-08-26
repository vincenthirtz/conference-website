// lib/i18n/locales/en/homeEvents.ts
//
// Traductions ANGLAISES du namespace `homeEvents`.
//
// La SOURCE DE VERITE est le francais (`../fr/homeEvents.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  locTwitch: 'On Twitch',
  locDiscord: 'On Discord',
  locIrl: 'IRL',
  locOnline: 'Online',
  learnMore: 'Learn more',
  eyebrow: 'Agenda',
  title: 'Upcoming events',
  subtitle: 'Tournaments, charity streams and community events.',
  badgeTournament: 'Tournament',
  badgeLive: 'Live',
  teamsRegisteredSuffix: 'teams registered',
  teamsRegisteredSimple: '{count} teams registered',
  slotsLeft_one: '{count} spot left',
  slotsLeft_other: '{count} spots left',
  viewMatches: 'View matches',
  register: 'Register',
  guideLink: 'First time registering? See the captain guide',
};
