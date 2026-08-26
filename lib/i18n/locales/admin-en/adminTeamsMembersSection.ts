// lib/i18n/locales/admin-en/adminTeamsMembersSection.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamsMembersSection`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamsMembersSection.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  membersTitle: 'Members ({count})',
  cancelSwap: 'Cancel swap',
  importBattleTags: 'Import BattleTags',
  add: 'Add',
  selectToSwap: 'Select a member to swap with',
  selectedCount: '{count} selected',
  selectAll: 'Select all',
  rolePlaceholder: 'Role…',
  apply: 'Apply',
  markSub: 'Mark as substitute',
  unmarkSub: 'Unmark substitute',
  removeFromTeam: 'Remove from team',
  deselect: 'Deselect',
  captainProtected:
    "The captain is protected: they won't be removed or made a substitute.",
  loading: 'Loading...',
  emptyTeam: 'No members in this team',
  rosterTitle: 'Roster ({count})',
  noActivePlayer: 'No active player',
  subsTitle: 'Substitutes ({count})',
  noSub: 'No substitute',
  staffTitle: 'Team staff ({count})',
  noStaff: 'No coach or manager',
};
