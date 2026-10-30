// lib/i18n/locales/admin-en/adminTournamentPool.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentPool`.
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentPool.ts`).
// Ne PAS annoter `as const` : la parite se verifie contre le francais.

export default {
  headTitle: 'Admin – Player distribution',
  title: 'Player distribution',
  subtitle:
    'Teams with 5 signed-up members are entered automatically. Here you place the rest of the waitlist: cores from the same team topped up, mixed teams formed for the night. A team plays with 5 and can take up to 3 substitutes for rotations. Players always keep their real team.',
  notPooled:
    'This tournament does not use pooled individual sign-up. Enable it in Settings › General.',
  loadError: 'Distribution unavailable.',
  loading: 'Loading…',
  refresh: 'Refresh',
  stats: '{teams} teams entered · {placed} players placed · {waiting} waiting',
  proposalTitle: 'Proposal',
  proposalHelp:
    'Computed from the waitlist: biggest cores first, topped up with players without a team, then with players from other cores. Approve team by team, or place by hand below.',
  proposalEmpty: 'No complete team can be formed from the current waitlist.',
  proposalCore: '{team} core, topped up',
  proposalMixed: 'Mixed team',
  proposalMixedName: 'Mixed team name',
  proposalMixedDefault: 'Team {n}',
  proposalApply: 'Approve this team',
  proposalLeftover:
    '{count} player(s) would stay on the waitlist: not enough for a complete team.',
  waitlistTitle: 'Waitlist',
  waitlistEmpty: 'Nobody waiting.',
  noTeam: 'No team',
  fromTeam: 'Team: {team}',
  manualTitle: 'Place the selection',
  manualSelected: '{count} selected',
  manualTarget: 'Into',
  manualNewTeam: 'New mixed team…',
  manualNewTeamName: 'New team name',
  manualPlace: 'Place',
  squadsTitle: 'Entered teams',
  squadsEmpty: 'No team entered yet.',
  squadMixed: 'mixed',
  squadIncomplete: 'Incomplete: {count} / {size}',
  squadSubs: '{size} + {subs} sub(s)',
  squadNoPool:
    'Entered outside individual sign-up: its players are not listed here.',
  unplace: 'Back to waitlist',
  errTeamFull: 'This team is already full, substitutes included.',
  errNotWaiting:
    'One of the players is no longer waiting: the list was refreshed.',
  errGeneric: 'The operation failed.',
  done: 'Distribution updated.',

  addTitle: 'Add a player',
  addHelp:
    'For a player who signed up outside the form (Discord, message…). No site account needed.',
  fieldName: 'Name',
  fieldBattleTag: 'BattleTag',
  fieldOrigin: 'Original team',
  addSubmit: 'Add to the waitlist',
  manualChip: 'added by hand',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  withdraw: 'Remove',
  withdrawConfirmTitle: 'Remove {name} from the tournament?',
  withdrawConfirmBody:
    'She leaves the waitlist or her team. You can put her back on the waitlist from “Removed”.',
  moveTo: 'Move to…',
  createTeamTitle: 'Create an empty team',
  createTeamHelp:
    'A mixed team entered with no players: fill it from the waitlist afterwards.',
  teamNameLabel: 'Team name',
  createTeamSubmit: 'Create the team',
  rename: 'Rename',
  dissolve: 'Delete the team',
  dissolveConfirmTitle: 'Delete {team} from the tournament?',
  dissolveConfirmBody:
    'Its players go back to the waitlist and the team is withdrawn from the tournament. A real site team is not deleted: it is only withdrawn.',
  dissolveLocked: 'Already has matches: it can no longer be deleted.',
  withdrawnTitle: 'Removed · {count}',
  restore: 'Back to the waitlist',
  errInvalidTarget:
    'This team is not entered in this tournament: the list was refreshed.',
  errHasMatches: 'This team already has matches: it cannot be deleted.',
  errNotMixed: 'Only a team formed by the staff can be renamed here.',
  errNotActive: 'This player is no longer signed up: the list was refreshed.',
  errInvalidBody:
    'Check the fields: name 2 to 40 characters, BattleTag 3 to 40, team name 2 to 60.',

  // Sign-up overview (pages/admin/tournament/[id]/participants.tsx).
  overviewHeadTitle: 'Admin – Sign-ups',
  overviewTitle: 'Sign-up overview',
  overviewSubtitle:
    'Every entered team with its players, the waitlist grouped by origin team, and the players who signed up alone. Read-only: distribution happens in the Distribution tab.',
  overviewToPool: 'Open distribution',
  overviewStatTeams: 'Teams entered',
  overviewStatPlayers: 'Players in a team',
  overviewStatWaiting: 'Waiting',
  overviewStatSolos: 'Alone, no team',
  overviewTeamsTitle: 'Entered teams',
  overviewTeamCount: '{count} / {size}',
  overviewFromRoster: 'roster',
  overviewFromRosterHelp:
    'Entered directly: the team’s roster, not individual sign-ups.',
  overviewNoPlayers: 'No known player for this team.',
  overviewSubstitute: 'substitute',
  overviewWaitingTitle: 'Waiting, with their team',
  overviewWaitingEmpty: 'No player waiting with a team.',
  overviewWaitingCount: '{count} / {size} signed up',
  overviewSolosTitle: 'Alone, no team',
  overviewSolosEmpty: 'No player signed up alone.',
  overviewSignedUpOn: 'signed up on {date}',
};
