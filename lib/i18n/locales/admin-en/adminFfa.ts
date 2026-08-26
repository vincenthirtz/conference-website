// lib/i18n/locales/admin-en/adminFfa.ts
//
// Traductions ANGLAISES du namespace admin `adminFfa`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminFfa.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  stageTypeFfa: 'FFA / Points ranking',
  settingsTitle: 'FFA settings',
  settingsHelp:
    'An FFA stage groups teams into lobbies. Each team gets a placement (1 = winner) converted into points via the table below.',
  lobbySizeLabel: 'Lobby size',
  lobbySizeHelp: 'Expected number of teams per lobby (indicative).',
  tiebreakLabel: 'Tiebreak',
  tiebreakBestPlacement: 'Best placement',
  tiebreakTotalPoints: 'Total points',
  tiebreakMostFirsts: 'Most first places',
  pointsTableLabel: 'Points table',
  pointsTableHelp: 'Points awarded based on the placement within a lobby.',
  addRow: 'Add row',
  removeRow: 'Remove row',
  placement: 'Placement',
  points: 'Points',
  score: 'Score',
  team: 'Team',
  errPointsTableEmpty: 'The points table cannot be empty.',
  statusPending: 'Pending',
  statusInProgress: 'In progress',
  statusCompleted: 'Completed',
  statusLabel: 'Status',
  errLoad: 'Failed to load lobbies.',
  toastLobbyCreated: 'Lobby created.',
  errCreateLobby: 'Failed to create lobby.',
  deleteLobbyTitle: 'Delete lobby',
  deleteLobbyConfirm:
    'This removes the lobby and all its placements. Continue?',
  delete: 'Delete',
  toastLobbyDeleted: 'Lobby deleted.',
  errDeleteLobby: 'Failed to delete lobby.',
  errInvalidPlacement: 'Placement must be a positive integer or empty.',
  errInvalidScore: 'Score must be a number or empty.',
  toastPlacementsSaved: 'Placements saved.',
  errSavePlacements: 'Failed to save placements.',
  loading: 'Loading lobbies…',
  lobbiesTitle: 'FFA lobbies',
  lobbiesDesc:
    'Create lobbies, enter placements and track the stage standings.',
  createLobby: 'Create lobby',
  lobbyName: 'Lobby name',
  lobbyNamePlaceholder: 'e.g. Lobby A',
  roundNumber: 'Round',
  creating: 'Creating…',
  emptyLobbies: 'No lobbies yet. Create one to get started.',
  unnamedLobby: 'Unnamed lobby',
  deleteLobby: 'Delete lobby',
  emptyTeams: 'No teams in this lobby. Add one below.',
  removeTeam: 'Remove team',
  addTeam: 'Add team',
  noTeamsAvailable: 'No teams available',
  selectTeam: 'Select a team…',
  saving: 'Saving…',
  save: 'Save',
  standingsTitle: 'Stage standings',
  emptyStandings: 'No placements entered yet.',
  totalPoints: 'Total points',
  lobbiesPlayed: 'Lobbies played',
  bestPlacement: 'Best placement',
  firsts: 'First places',
};
