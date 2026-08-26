// lib/i18n/locales/en/registrationDeadline.ts
//
// Traductions ANGLAISES du namespace `registrationDeadline`.
//
// La SOURCE DE VERITE est le francais (`../fr/registrationDeadline.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: '2026 tournament registration',
  deadline: 'Closes on {date}.',
  countdown_one: '{count} day left',
  countdown_other: '{count} days left',
  lastDay: 'Today is the last day',
  body: 'Player, captain, coach or manager: to be validated on a roster you must be present on BOTH sides — on the Discord server and on the site, with the two accounts linked. Being on only one of them is not enough.',
  stepSite: 'Site account',
  stepSiteDone: 'Done — you are signed in.',
  stepDiscord: 'Discord account linked',
  stepDiscordDone: 'Done.',
  stepDiscordTodo:
    'Your Discord account is not linked yet: without it we cannot recognise you on the server.',
  joinReminder:
    "And double-check that you have actually joined the tournament's Discord server.",
  ctaLink: 'Link my Discord account',
  ctaJoin: 'Join the Discord',
  dismiss: 'Hide this reminder',
};
