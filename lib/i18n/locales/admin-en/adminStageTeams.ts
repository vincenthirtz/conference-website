// lib/i18n/locales/admin-en/adminStageTeams.ts
//
// Traductions ANGLAISES du namespace admin `adminStageTeams`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStageTeams.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errUnexpected: 'Unexpected error',
  errSelectTeam: 'Please select a team to add.',
  toastAdded: 'Team added to the stage.',
  errAdd: 'Unexpected error while adding',
  toastRemoved: 'Team removed from the stage.',
  errRemove: 'Unexpected error while removing',
  toastSeedUpdated: 'Seed updated.',
  errSeedUpdate: 'Unexpected error while updating the seed',
  toastBulkSeed_one: 'Seeds updated for {count} team.',
  toastBulkSeed_other: 'Seeds updated for {count} teams.',
  errBulkSeed: 'Unexpected error during bulk seed',
  confirmBulkRemove_one: 'Remove {count} team from this stage?',
  confirmBulkRemove_other: 'Remove {count} teams from this stage?',
  toastBulkRemoved_one: '{count} team removed from the stage.',
  toastBulkRemoved_other: '{count} teams removed from the stage.',
  errBulkRemove: 'Unexpected error during bulk removal',
  pageTitle: 'Admin – Stage teams',
  back: '← Back to stage',
  heading: 'Stage teams',
  subtitle: 'Manage the teams attached to this stage: add, remove, seeds…',
  loadingTeams: 'Loading stage teams…',
  phaseLabel: 'Stage',
  tournamentPrefix: 'Tournament:',
  teamsInPhaseLabel: 'Teams in the stage:',
  addTeamTitle: 'Add a team to this stage',
  teamSelectLabel: 'Team (tournament)',
  loadingShort: 'Loading…',
  selectTeam: 'Select a team',
  seedOptionalLabel: 'Seed (optional)',
  adding: 'Adding…',
  addTeamSubmit: 'Add team',
  allTeamsAttached: 'All tournament teams are already attached to this stage.',
  attachedTeamsTitle: 'Teams attached to the stage',
  teamCount_one: '{count} team',
  teamCount_other: '{count} teams',
  autoSeedTitle: 'Automatically number 1, 2, 3… in the current order',
  autoSeed: 'Auto-seed 1..N',
  bulkSeedSaving: 'Saving…',
  bulkSeedSave: 'Save all seeds',
  bulkRemoving: 'Removing…',
  bulkRemove_one: 'Remove {count} team',
  bulkRemove_other: 'Remove {count} teams',
  emptyTeams: 'No team is attached to this stage yet.',
  thSeed: 'Seed',
  thTeam: 'Team',
  thNotes: 'Notes',
  thActions: 'Actions',
  seedOkSaving: 'OK…',
  seedOk: 'OK',
  viewTeam: 'View team',
  removing: 'Removing…',
  remove: 'Remove',
  stageNotFound: 'Stage not found.',
};
