// lib/i18n/locales/fr/overwatchRank.ts
//
// Traductions FRANCAISES du namespace `overwatchRank` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Les CLES de palier viennent de `utils/overwatchRank.ts`, qui ne connait que
// des identifiants — les noms lisibles sont ici, et nulle part ailleurs.

import { ns } from '../../ns';

export default ns('overwatchRank', {
  tierBronze: 'Bronze',
  tierSilver: 'Argent',
  tierGold: 'Or',
  tierPlatinum: 'Platine',
  tierEmerald: 'Émeraude',
  tierDiamond: 'Diamant',
  tierMaster: 'Maître',
  tierGrandmaster: 'Grand maître',

  /** Libellé générique du champ, réutilisé partout où on le saisit. */
  fieldLabel: 'Niveau Overwatch (SR)',
  fieldPlaceholder: '3500',
  fieldHint: 'Entre 0 et 5000. Laisse vide si tu préfères ne pas le déclarer.',
  fieldInvalid: 'Le SR doit être un nombre entier entre 0 et 5000.',
  notDeclared: 'Non déclaré',

  teamAverageLabel: "Niveau moyen de l'équipe",
  /** « moyenne sur 4 des 6 joueuses » — dit sur quoi le chiffre porte. */
  teamAverageBasis: 'moyenne sur {count} des {eligible} joueuses',
  teamAverageComplete: 'moyenne sur les {count} joueuses',
  teamAverageEmpty: 'Aucune joueuse n’a déclaré son niveau.',
});
