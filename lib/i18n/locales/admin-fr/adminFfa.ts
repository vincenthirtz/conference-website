// lib/i18n/locales/admin-fr/adminFfa.ts
//
// Traductions FRANCAISES du namespace `adminFfa` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminFfa', {
  stageTypeFfa: 'FFA / Classement par points',
  settingsTitle: 'Réglages FFA',
  settingsHelp:
    'Une phase FFA regroupe les équipes en lobbies. Chaque équipe reçoit un placement (1 = vainqueur) converti en points via la table ci-dessous.',
  lobbySizeLabel: 'Taille de lobby',
  lobbySizeHelp: "Nombre d'équipes attendues par lobby (indicatif).",
  tiebreakLabel: 'Départage',
  tiebreakBestPlacement: 'Meilleur placement',
  tiebreakTotalPoints: 'Total de points',
  tiebreakMostFirsts: 'Nombre de 1res places',
  pointsTableLabel: 'Table de points',
  pointsTableHelp: 'Points attribués selon le placement dans un lobby.',
  addRow: 'Ajouter une ligne',
  removeRow: 'Retirer la ligne',
  placement: 'Placement',
  points: 'Points',
  score: 'Score',
  team: 'Équipe',
  errPointsTableEmpty: 'La table de points ne peut pas être vide.',
  statusPending: 'En attente',
  statusInProgress: 'En cours',
  statusCompleted: 'Terminé',
  statusLabel: 'Statut',
  errLoad: 'Échec du chargement des lobbies.',
  toastLobbyCreated: 'Lobby créé.',
  errCreateLobby: 'Échec de la création du lobby.',
  deleteLobbyTitle: 'Supprimer le lobby',
  deleteLobbyConfirm:
    'Cette action supprime le lobby et tous ses placements. Continuer ?',
  delete: 'Supprimer',
  toastLobbyDeleted: 'Lobby supprimé.',
  errDeleteLobby: 'Échec de la suppression du lobby.',
  errInvalidPlacement: 'Le placement doit être un entier positif ou vide.',
  errInvalidScore: 'Le score doit être un nombre ou vide.',
  toastPlacementsSaved: 'Placements enregistrés.',
  errSavePlacements: "Échec de l'enregistrement des placements.",
  loading: 'Chargement des lobbies…',
  lobbiesTitle: 'Lobbies FFA',
  lobbiesDesc:
    'Créez des lobbies, saisissez les placements et suivez le classement de la phase.',
  createLobby: 'Créer un lobby',
  lobbyName: 'Nom du lobby',
  lobbyNamePlaceholder: 'ex. Lobby A',
  roundNumber: 'Manche',
  creating: 'Création…',
  emptyLobbies: "Aucun lobby pour l'instant. Créez-en un pour commencer.",
  unnamedLobby: 'Lobby sans nom',
  deleteLobby: 'Supprimer le lobby',
  emptyTeams: 'Aucune équipe dans ce lobby. Ajoutez-en une ci-dessous.',
  removeTeam: "Retirer l'équipe",
  addTeam: 'Ajouter une équipe',
  noTeamsAvailable: 'Aucune équipe disponible',
  selectTeam: 'Sélectionner une équipe…',
  saving: 'Enregistrement…',
  save: 'Enregistrer',
  standingsTitle: 'Classement de la phase',
  emptyStandings: "Aucun placement saisi pour l'instant.",
  totalPoints: 'Total points',
  lobbiesPlayed: 'Lobbies joués',
  bestPlacement: 'Meilleur placement',
  firsts: '1res places',
});
