// lib/i18n/locales/fr/teamCard.ts
//
// Traductions FRANCAISES du namespace `teamCard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamCard', {
  myTeam: 'Mon equipe',
  captain: 'Capitaine',
  members_one: 'membre',
  members_other: 'membres',
  roleTank: 'Tank',
  roleDps: 'DPS',
  roleSupport: 'Support',
  roleSub: 'Sub',
  roleCoach: 'Coach',
  manageTeam: 'Gerer mon equipe',
  viewTeamPage: 'Voir la page equipe',
  requestTransfer: 'Demander un transfert',
  proposeScrim: 'Proposer un scrim',
  captainMessages: 'Messagerie capitaine',
  leaveTeam: "Quitter l'equipe",
  leaveConfirm: 'Es-tu sur de vouloir quitter {name} ?',
  leaving: 'En cours...',
  confirm: 'Confirmer',
  cancel: 'Annuler',
  genericError: 'Erreur',
  notMember: "Tu n'es pas encore membre d'une equipe.",
  pendingCaptain: 'Demande de capitaine en attente',
  pendingGeneric: 'Demande en attente',
  teamLabel: 'Equipe : ',
  joinLabel: 'Rejoindre : ',
  sentOn: 'Envoyee le {date}',
  joinTeam: 'Rejoindre une equipe',
  createTeam: 'Creer ma propre equipe',
  browseTeams: 'Parcourir les équipes',
});
