// lib/i18n/locales/admin-fr/adminMatchReadinessChecklist.ts
//
// Traductions FRANCAISES du namespace `adminMatchReadinessChecklist` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminMatchReadinessChecklist', {
  team1Assigned: 'Equipe 1 assignee',
  notAssigned: 'Non assignee',
  team2Assigned: 'Equipe 2 assignee',
  formatDefined: 'Format defini',
  formatUndefined: 'Non defini',
  scheduleSet: 'Horaire programme',
  notScheduled: 'Non programme',
  streamConfigured: 'Stream configure',
  noStream: 'Aucun stream',
  lobbyCodeSet: 'Code lobby renseigne',
  notSet: 'Non renseigne',
  tournamentRunning: 'Tournoi en cours',
  statusRunning: 'En cours',
  statusPublished: 'Publie',
  unknownStatus: 'Statut inconnu',
  stageActive: 'Phase active',
  yes: 'Oui',
  inactive: 'Inactive',
  matchNotCancelled: 'Match non annule',
  statusCancelled: 'Annule',
  statusFinished: 'Termine',
  statusUpcoming: 'A venir',
  heading: 'Checklist',
  allReady:
    'Toutes les conditions sont remplies. Le match est pret a etre lance.',
});
