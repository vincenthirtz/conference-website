// lib/i18n/locales/fr/playerHeroPrefs.ts
//
// Traductions FRANCAISES du namespace `playerHeroPrefs` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/playerHeroPrefs.ts`. Toute cle ajoutee ici
// doit l'etre aussi cote anglais : le garde-fou de compilation `../parity.ts`
// casse le typecheck sinon.
//
// TON DE CETTE SECTION. Ces choix ne servent pas qu'a decorer un profil : ils
// decident du personnage qui representera la joueuse sur sa carte a
// collectionner si elle ne depose pas de photo. Les textes le disent avant les
// listes, pour qu'aucune joueuse ne decouvre apres coup qu'un heros la
// represente publiquement.
//
// LES NOMS DE HEROS NE SONT PAS TRADUITS : ce sont des noms propres, et le
// referentiel `utils/heroes/overwatch.ts` en est la seule source. Seuls les
// libelles de ROLE le sont ici.

import { ns } from '../../ns';

export default ns('playerHeroPrefs', {
  title: 'Mes héros',
  intro:
    'Les héros que tu aimes jouer, et ceux que tu préfères éviter. Trois de chaque, au maximum.',

  // Dit AVANT les listes : la conséquence visible passe avant le formulaire.
  tcgNote:
    'Si tu ne déposes pas de photo pour ta carte à collectionner, c’est ton premier héros préféré qui te représentera. Sans photo ni héros choisi, ta carte reste sur ton avatar.',

  picksTitle: 'Héros préférés',
  picksHint: 'Du plus au moins représentatif : le premier sera retenu.',
  bansTitle: 'Héros évités',
  bansHint: 'Ceux-là ne te seront jamais proposés.',

  slotEmpty: 'Emplacement libre',
  addPick: 'Ajouter un héros préféré',
  addBan: 'Ajouter un héros évité',
  removeAria: 'Retirer {hero}',
  choosePlaceholder: 'Choisir un héros…',

  roleTank: 'Tank',
  roleDamage: 'Dégâts',
  roleSupport: 'Soutien',

  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Tes héros sont enregistrés',
  reset: 'Annuler les modifications',

  loadError: 'Impossible de charger tes héros.',
  saveError: 'L’enregistrement a échoué, réessaie.',
});
