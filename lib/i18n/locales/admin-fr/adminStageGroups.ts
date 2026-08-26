// lib/i18n/locales/admin-fr/adminStageGroups.ts
//
// Traductions FRANCAISES du namespace `adminStageGroups` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStageGroups', {
  groupLabel: 'Poule {key}',
  errUnexpected: 'Erreur inattendue',
  confirmGenerate:
    'Générer les matchs round-robin pour toutes les poules ({rounds} round(s), {format}) ?',
  errGenerate: 'Erreur génération',
  toastGenerated: '{count} matchs créés sur {groupCount} poule(s)',
  toastSaved: 'Groupes sauvegardés avec succès',
  toastDistributed: 'Equipes distribuées en {count} poule(s)',
  pageTitle: 'Admin – Poules',
  pageTitleWithStage: 'Admin – Poules : {name}',
  back: 'Retour à la phase',
  heading: 'Gestion des Poules',
  phaseLabel: 'Phase :',
  tournamentLabel: '— Tournoi :',
  teamsGroupsSummary: '{teams} equipe(s) — {groups} poule(s)',
  saving: 'Sauvegarde...',
  save: 'Sauvegarder',
  autoDistributeTitle: 'Distribution automatique',
  numGroupsLabel: 'Nombre de poules',
  methodLabel: 'Methode',
  methodSnake: 'Snake (par seed)',
  methodRandom: 'Aleatoire',
  distributing: 'Distribution...',
  distribute: 'Distribuer',
  addGroup: 'Ajouter une poule',
  dndHelp:
    'Glissez-déposez les equipes entre les poules. Cliquez « Sauvegarder » pour enregistrer.',
  groupTeamCount: '{count} equipe(s)',
  removeGroupTitle: 'Supprimer cette poule',
  dropTeamsHere: 'Deposez des equipes ici',
  unassignedLabel: 'Non assignees',
  allAssigned: 'Toutes les equipes sont assignees',
  noTeamsInPhase: 'Aucune equipe dans cette phase',
  genMatchesTitle: 'Génération des matchs',
  genMatchesHelp:
    'Crée les matchs round-robin pour chaque poule à partir des assignations actuelles. À faire une seule fois — annuler les matchs avant de regénérer.',
  roundsLabel: 'Rounds (1 = aller, 2 = aller-retour)',
  matchFormatLabel: 'Format de match',
  generating: 'Génération...',
  generate: 'Générer les matchs',
  standingsTitle: 'Classement par poule',
  refresh: 'Rafraîchir',
  thTeam: 'Équipe',
  thWins: 'V',
  thLosses: 'D',
  thDraws: 'N',
  thPoints: 'Pts',
});
