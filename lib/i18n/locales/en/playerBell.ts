// lib/i18n/locales/en/playerBell.ts
//
// Traductions ANGLAISES du namespace `playerBell`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerBell.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Notifications',
  empty: 'No notifications',
  ariaLabel: 'My player space — {tooltip}',
  checkinPending: 'check-in to confirm',
  messages_one: '{count} message',
  messages_other: '{count} messages',
  scrims_one: '{count} scrim',
  scrims_other: '{count} scrims',
  candidatures_one: '{count} application',
  candidatures_other: '{count} applications',
};
