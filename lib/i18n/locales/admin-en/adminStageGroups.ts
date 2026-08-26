// lib/i18n/locales/admin-en/adminStageGroups.ts
//
// Traductions ANGLAISES du namespace admin `adminStageGroups`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStageGroups.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  groupLabel: 'Group {key}',
  errUnexpected: 'Unexpected error',
  confirmGenerate:
    'Generate round-robin matches for all groups ({rounds} round(s), {format})?',
  errGenerate: 'Generation error',
  toastGenerated: '{count} matches created across {groupCount} group(s)',
  toastSaved: 'Groups saved successfully',
  toastDistributed: 'Teams distributed into {count} group(s)',
  pageTitle: 'Admin – Groups',
  pageTitleWithStage: 'Admin – Groups: {name}',
  back: 'Back to stage',
  heading: 'Group Management',
  phaseLabel: 'Stage:',
  tournamentLabel: '— Tournament:',
  teamsGroupsSummary: '{teams} team(s) — {groups} group(s)',
  saving: 'Saving...',
  save: 'Save',
  autoDistributeTitle: 'Automatic distribution',
  numGroupsLabel: 'Number of groups',
  methodLabel: 'Method',
  methodSnake: 'Snake (by seed)',
  methodRandom: 'Random',
  distributing: 'Distributing...',
  distribute: 'Distribute',
  addGroup: 'Add a group',
  dndHelp: 'Drag and drop teams between groups. Click “Save” to record.',
  groupTeamCount: '{count} team(s)',
  removeGroupTitle: 'Remove this group',
  dropTeamsHere: 'Drop teams here',
  unassignedLabel: 'Unassigned',
  allAssigned: 'All teams are assigned',
  noTeamsInPhase: 'No teams in this stage',
  genMatchesTitle: 'Match generation',
  genMatchesHelp:
    'Creates round-robin matches for each group from the current assignments. Do this only once — cancel the matches before regenerating.',
  roundsLabel: 'Rounds (1 = single, 2 = home-and-away)',
  matchFormatLabel: 'Match format',
  generating: 'Generating...',
  generate: 'Generate matches',
  standingsTitle: 'Standings by group',
  refresh: 'Refresh',
  thTeam: 'Team',
  thWins: 'W',
  thLosses: 'L',
  thDraws: 'D',
  thPoints: 'Pts',
};
