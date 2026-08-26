// lib/i18n/locales/en/actualitesPreview.ts
//
// Traductions ANGLAISES du namespace `actualitesPreview`.
//
// La SOURCE DE VERITE est le francais (`../fr/actualitesPreview.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusCancelled: 'Cancelled',
  title: 'Mixed Tournament',
  subtitle:
    'Mixed men/women tournament to kick off the competitive season. A taste of what awaits you in October !',
  cardMixteValue: 'Mixed',
  cardMixteLabel: 'Open format',
  cardDateValue: 'April 3',
  cardDateLabel: 'Save the date',
  cardSeasonValue: '2026 Season',
  cardSeasonLabel: 'Kick-off',
  castLabel: 'Cast',
  registerTeam: 'Register my team',
  seeProgram: 'See the program',
  seeStatement: 'See the statement',
};
