// lib/i18n/locales/admin-en/adminTournamentPool.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentPool`.
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentPool.ts`).
// Ne PAS annoter `as const` : la parite se verifie contre le francais.

export default {
  headTitle: 'Admin – Player distribution',
  title: 'Player distribution',
  subtitle:
    'Teams with 5 signed-up members are entered automatically. Here you place the rest of the waitlist: cores from the same team topped up, mixed teams formed for the night. Players always keep their real team.',
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
  squadNoPool:
    'Entered outside individual sign-up: its players are not listed here.',
  unplace: 'Back to waitlist',
  errTeamFull: 'This team is already full.',
  errNotWaiting:
    'One of the players is no longer waiting: the list was refreshed.',
  errGeneric: 'The operation failed.',
  done: 'Distribution updated.',
};
