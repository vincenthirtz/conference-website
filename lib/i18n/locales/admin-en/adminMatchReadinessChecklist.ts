// lib/i18n/locales/admin-en/adminMatchReadinessChecklist.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchReadinessChecklist`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchReadinessChecklist.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  team1Assigned: 'Team 1 assigned',
  notAssigned: 'Not assigned',
  team2Assigned: 'Team 2 assigned',
  formatDefined: 'Format defined',
  formatUndefined: 'Not defined',
  scheduleSet: 'Schedule set',
  notScheduled: 'Not scheduled',
  streamConfigured: 'Stream configured',
  noStream: 'No stream',
  lobbyCodeSet: 'Lobby code set',
  notSet: 'Not set',
  tournamentRunning: 'Tournament running',
  statusRunning: 'Running',
  statusPublished: 'Published',
  unknownStatus: 'Unknown status',
  stageActive: 'Stage active',
  yes: 'Yes',
  inactive: 'Inactive',
  matchNotCancelled: 'Match not cancelled',
  statusCancelled: 'Cancelled',
  statusFinished: 'Finished',
  statusUpcoming: 'Upcoming',
  heading: 'Checklist',
  allReady: 'All conditions are met. The match is ready to be started.',
};
