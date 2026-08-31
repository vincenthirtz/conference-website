// lib/i18n/locales/admin-en/adminTeamsAddMemberModal.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamsAddMemberModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamsAddMemberModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Add a player',
  subtitle: 'Search for an existing member or enter their information',
  cancel: 'Cancel',
  adding: 'Adding...',
  addPlayer: 'Add player',
  searchLabel: 'Search for an existing player',
  searchHint: 'By email, name or BattleTag',
  searchPlaceholder: 'Type at least 2 characters...',
  noResults: 'No results found',
  playerFallback: 'Player',
  teamPrefix: 'Team: {name}',
  orManual: 'or enter manually',
  emailLabel: 'User email',
  userIdLabel: 'Or User ID',
  battleTagFormat: 'Format: Name#0000',
  skillRatingLabel: 'Overwatch skill rating (SR) — optional',
  roleLabel: 'Role in the team',
  statusLabel: 'Status',
  captain: 'Captain',
  captainDesc: 'Team leader',
  substitute: 'Substitute',
  substituteDesc: 'Reserve player',
};
