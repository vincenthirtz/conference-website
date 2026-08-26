// lib/i18n/locales/en/newTeamForm.ts
//
// Traductions ANGLAISES du namespace `newTeamForm`.
//
// La SOURCE DE VERITE est le francais (`../fr/newTeamForm.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  invalidEmail: 'Invalid email',
  duplicateEmail: 'Email already used by another member',
  battleTagFormat: 'Expected format: Name#1234',
  duplicateBattleTag: 'BattleTag already used by another member',
  teamNameLabel: 'Team name *',
  teamNamePlaceholder: 'Ex: Space Unicorns',
  playersLabel: 'Players (optional)',
  playersHelp: 'Add your team players. They will receive an invitation.',
  player: 'Player {n}',
  remove: 'Remove',
  emailPlaceholder: 'Email *',
  battleTagPlaceholder: 'BattleTag (Name#1234)',
  nicknamePlaceholder: 'Nickname',
  addPlayer: '+ Add a player',
  specialtyLabel: 'Player {n} specialty',
  specialtyNone: 'Unspecified',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  emailAriaLabel: 'Player {n} email',
  battleTagAriaLabel: 'Player {n} BattleTag',
  nicknameAriaLabel: 'Player {n} nickname',
};
