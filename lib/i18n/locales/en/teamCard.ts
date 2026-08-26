// lib/i18n/locales/en/teamCard.ts
//
// Traductions ANGLAISES du namespace `teamCard`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamCard.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  myTeam: 'My team',
  captain: 'Captain',
  members_one: 'member',
  members_other: 'members',
  roleTank: 'Tank',
  roleDps: 'DPS',
  roleSupport: 'Support',
  roleSub: 'Sub',
  roleCoach: 'Coach',
  manageTeam: 'Manage my team',
  viewTeamPage: 'View team page',
  requestTransfer: 'Request a transfer',
  proposeScrim: 'Propose a scrim',
  captainMessages: 'Captain inbox',
  leaveTeam: 'Leave the team',
  leaveConfirm: 'Are you sure you want to leave {name}?',
  leaving: 'Processing...',
  confirm: 'Confirm',
  cancel: 'Cancel',
  genericError: 'Error',
  notMember: 'You are not part of a team yet.',
  pendingCaptain: 'Captain request pending',
  pendingGeneric: 'Request pending',
  teamLabel: 'Team: ',
  joinLabel: 'Join: ',
  sentOn: 'Sent on {date}',
  joinTeam: 'Join a team',
  createTeam: 'Create my own team',
  browseTeams: 'Browse teams',
};
