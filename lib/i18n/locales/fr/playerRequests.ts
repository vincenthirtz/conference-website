// lib/i18n/locales/fr/playerRequests.ts
//
// Traductions FRANCAISES du namespace `playerRequests` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerRequests', {
  connectionError: 'Erreur de connexion.',
  errSelectTargetTeam: 'Selectionne une equipe cible.',
  errSelectPlayer: 'Selectionne un joueur a transferer.',
  errSelectOpponent: 'Selectionne une equipe adverse.',
  errCreateRequest: 'Impossible de creer la demande.',
  errGeneric: 'Une erreur est survenue.',
  fallbackPlayer: 'le joueur',
  fallbackTeam: "l'equipe",
  successProposeTransfer:
    'La proposition de transfert de {playerName} vers "{teamName}" a ete envoyee.',
  successSelfTransfer:
    'Ta demande de transfert vers "{teamName}" a ete envoyee. Le capitaine de l\'equipe cible la validera.',
  successScrim: 'Ta demande de scrim contre "{teamName}" a ete envoyee.',
  successTitleTab: "Demande envoyee | OW Women's Cup",
  successHeading: 'Demande envoyee',
  backToSpace: 'Retour a mon espace',
  pageTitleTab: "Demandes | OW Women's Cup",
  heading: 'Demandes',
  intro: 'Demande un transfert vers une autre equipe ou propose un scrim.',
  tabTransfer: 'Transfert',
  tabScrim: 'Scrim',
  noTeamTitle: "Pas d'equipe",
  noTeamTransfer:
    "Tu dois etre membre d'une equipe pour demander un transfert.",
  noTeamScrim: "Tu dois etre membre d'une equipe pour proposer un scrim.",
  joinTeam: 'Rejoindre une equipe',
  proposeTransferMode: 'Proposer un transfert',
  selfTransferMode: 'Mon transfert',
  captainTitle: 'Capitaine',
  captainBlocked:
    'En tant que capitaine, tu dois d’abord transferer le role de capitaine avant de pouvoir demander ton propre transfert.',
  playerToTransfer: 'Joueur a transferer',
  noPlayersInTeam: 'Aucun joueur dans ton equipe',
  targetTeam: 'Equipe cible',
  opponentTeam: 'Equipe adverse',
  searchTeam: 'Rechercher une equipe...',
  emptyJoinable: 'Aucune equipe ouverte au recrutement',
  emptyTeams: 'Aucune equipe trouvee',
  desiredRole: 'Role souhaite',
  rolePlayer: 'Joueur',
  roleSubstitute: 'Remplacant',
  roleCoach: 'Coach',
  fallbackPlayerName: 'Joueur',
  msgToTargetCaptain: 'Message au capitaine cible (optionnel)',
  msgToCaptain: 'Message au capitaine (optionnel)',
  msgToOpponent: "Message a l'equipe adverse (optionnel)",
  msgScrimPlaceholder: 'Propose un creneau, un format, des maps...',
  submitProposeTransfer: 'Proposer le transfert',
  submitSelfTransfer: 'Envoyer la demande de transfert',
  submitScrim: 'Envoyer la demande de scrim',
  captainOrManagerTitle: 'Capitaine ou manager requis',
  captainOrManagerBody:
    "Seul le capitaine ou un manager de l'equipe peut envoyer une demande de scrim.",
  dateLabel: 'Date souhaitee (optionnel)',
  loading: 'Chargement...',
  sending: 'Envoi en cours...',
  defaultMsgPlaceholder: 'Un message pour accompagner ta demande...',
  membersCount: '{count}/5 membres',
  slotsLabel: 'Créneaux proposés',
  addSlot: 'Ajouter un créneau',
  removeSlot: 'Retirer ce créneau',
  maxSlotsHint:
    "Proposez jusqu'à 5 créneaux. L'adversaire en choisira un ou vous en reproposera d'autres.",
  scrimTzNote: 'Créneaux dans ton fuseau : {tz}',
  slotPrevWeek: 'Semaine précédente',
  slotNextWeek: 'Semaine suivante',
  slotWeekOf: 'Semaine du {date}',
  slotMaxReached: '{max} créneaux maximum.',
  slotEmpty: 'Aucun créneau sélectionné — clique dans le calendrier.',
  atLeastOneSlot: 'Proposez au moins un créneau.',
  tabsAria: 'Type de demande',
  transferModeAria: 'Mode de transfert',
  roleGroupAria: 'Rôle souhaité',
});
