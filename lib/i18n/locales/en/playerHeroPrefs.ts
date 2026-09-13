// lib/i18n/locales/en/playerHeroPrefs.ts
//
// Traductions ANGLAISES du namespace `playerHeroPrefs`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerHeroPrefs.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string` — des types litteraux la feraient echouer.
//
// Les libelles de ROLE reprennent ici le vocabulaire du jeu en anglais
// (Tank / Damage / Support), qui est celui que les joueuses lisent en jeu.

export default {
  title: 'My heroes',
  intro:
    'The heroes you enjoy playing, and the ones you would rather avoid. Up to three of each.',

  tcgNote:
    'If you don’t upload a photo for your collectible card, your first preferred hero will represent you. With neither a photo nor a hero, your card falls back to your avatar.',

  picksTitle: 'Preferred heroes',
  picksHint: 'Most to least representative: the first one is the one we use.',
  bansTitle: 'Avoided heroes',
  bansHint: 'These will never be suggested for you.',

  slotEmpty: 'Empty slot',
  addPick: 'Add a preferred hero',
  addBan: 'Add an avoided hero',
  removeAria: 'Remove {hero}',
  choosePlaceholder: 'Choose a hero…',

  roleTank: 'Tank',
  roleDamage: 'Damage',
  roleSupport: 'Support',

  save: 'Save',
  saving: 'Saving…',
  saved: 'Your heroes have been saved',
  reset: 'Discard changes',

  loadError: 'Could not load your heroes.',
  saveError: 'Saving failed, please try again.',
};
