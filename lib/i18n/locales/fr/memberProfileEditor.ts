// lib/i18n/locales/fr/memberProfileEditor.ts
//
// Traductions FRANCAISES du namespace `memberProfileEditor` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('memberProfileEditor', {
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  captain: 'Capitaine',
  substitute: 'Remplaçante',
  memberFallback: 'Membre',
  displayNameLabel: 'Pseudo affiché',
  displayNamePlaceholder: 'Ex: Lyra',
  specialtyLabel: 'Spécialité',
  specialtyNone: 'Non précisée',
  avatarLabel: 'Avatar (URL https)',
  pronounsLabel: 'Pronoms',
  pronounsPlaceholder: 'elle, iel, she/her',
  taglineLabel: 'Phrase de profil',
  taglinePlaceholder: 'Ex: Sniper redoutée.',
  twitterLabel: 'Twitter',
  twitchLabel: 'Twitch',
  updateSuccess_one: 'Profil mis à jour ({count} champ).',
  updateSuccess_other: 'Profil mis à jour ({count} champs).',
  noChanges: 'Aucun changement.',
  errorUnexpected: 'Erreur inattendue.',
  saving: 'Enregistrement...',
  save: 'Enregistrer ce membre',
});
