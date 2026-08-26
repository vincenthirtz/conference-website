// lib/i18n/locales/fr/newTeamForm.ts
//
// Traductions FRANCAISES du namespace `newTeamForm` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('newTeamForm', {
  invalidEmail: 'Email invalide',
  duplicateEmail: 'Email déjà utilisé par un autre membre',
  battleTagFormat: 'Format attendu : Pseudo#1234',
  duplicateBattleTag: 'BattleTag déjà utilisé par un autre membre',
  teamNameLabel: "Nom de l'equipe *",
  teamNamePlaceholder: "Ex: Les Licornes de l'Espace",
  playersLabel: 'Joueuses (optionnel)',
  playersHelp:
    'Ajoute les joueuses de ton equipe. Elles recevront une invitation.',
  player: 'Joueuse {n}',
  remove: 'Retirer',
  emailPlaceholder: 'Email *',
  battleTagPlaceholder: 'BattleTag (Pseudo#1234)',
  nicknamePlaceholder: 'Pseudo',
  addPlayer: '+ Ajouter une joueuse',
  specialtyLabel: 'Spécialité de la joueuse {n}',
  specialtyNone: 'Non précisée',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  emailAriaLabel: 'Email de la joueuse {n}',
  battleTagAriaLabel: 'BattleTag de la joueuse {n}',
  nicknameAriaLabel: 'Pseudo de la joueuse {n}',
});
