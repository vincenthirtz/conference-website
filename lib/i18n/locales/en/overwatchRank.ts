// lib/i18n/locales/en/overwatchRank.ts
//
// Traductions ANGLAISES du namespace `overwatchRank`.
//
// La SOURCE DE VERITE est le francais (`../fr/overwatchRank.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  tierBronze: 'Bronze',
  tierSilver: 'Silver',
  tierGold: 'Gold',
  tierPlatinum: 'Platinum',
  tierEmerald: 'Emerald',
  tierDiamond: 'Diamond',
  tierMaster: 'Master',
  tierGrandmaster: 'Grandmaster',

  fieldLabel: 'Overwatch skill rating (SR)',
  fieldPlaceholder: '3500',
  fieldHint: 'Between 0 and 5000. Leave empty if you prefer not to declare it.',
  fieldInvalid: 'The SR must be a whole number between 0 and 5000.',
  notDeclared: 'Not declared',

  teamDeclaredLabel: 'Team SR',
  teamDeclaredHint:
    'Set here, it replaces the average of individual cards — handy if your players would rather not expose theirs.',
  teamDeclaredBasis: 'declared by the team',
  teamNotDeclared: 'No rating announced yet.',
  teamAverageLabel: 'Team average rating',
  teamAverageBasis: 'average over {count} of {eligible} players',
  teamAverageComplete: 'average over all {count} players',
  teamAverageEmpty: 'No player has declared their rating yet.',
};
