// lib/i18n/locales/en/homeCountdown.ts
//
// Traductions ANGLAISES du namespace `homeCountdown`.
//
// La SOURCE DE VERITE est le francais (`../fr/homeCountdown.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  kickoff: 'Kick-off',
  ariaLabel: 'Countdown to the tournament',
  unitDay: 'day',
  unitDays: 'days',
  unitHours: 'h',
  unitMinutes: 'min',
  unitSeconds: 's',
};
