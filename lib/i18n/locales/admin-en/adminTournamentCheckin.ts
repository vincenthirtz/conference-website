// lib/i18n/locales/admin-en/adminTournamentCheckin.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentCheckin`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentCheckin.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin – Check-in',
  backToTournament: 'Back to tournament',
  pageTitle: 'Match check-in',
  pageSubtitle:
    'Track attendance and auto-forfeits. The processor runs on its own (Netlify cron), but you can force a pass here.',
  liveConsole: 'Live console ↗',
  currentGraceTitle: 'Current grace window: {minutes} min',
  configureCheckin: 'Configure check-in',
  refresh: 'Refresh',
  processing: 'Processing...',
  processNow: 'Run now',
  statMatches: 'Matches',
  statUpcoming: 'Upcoming',
  statAllCheckedIn: 'All checked in',
  statNoCheckin: 'No check-in',
  statAutoForfeits: 'Auto-forfeits',
  filterUpcoming: 'Upcoming',
  filterAll: 'All',
  matchCount: '{count} matches',
  emptyMatches: 'No matches to display.',
  thDate: 'Date',
  thMatch: 'Match',
  thStatus: 'Status',
  thEmail: 'Email',
  thT30: 'T-30',
  thT15: 'T-15',
  thTeam1: 'Team1',
  thTeam2: 'Team2',
  thReason: 'Reason',
  thAction: 'Action',
  view: 'View',
  footerBefore:
    'The cron processor runs automatically every 5 minutes via Netlify Scheduled Functions. Matches without',
  footerAfter: 'are skipped.',
  settingsTitle: 'Configure check-in',
  settingsSubtitle: 'Grace window before auto-forfeit for no check-in.',
  cancel: 'Cancel',
  saving: 'Saving...',
  save: 'Save',
  graceLabel: 'Grace window (minutes)',
  graceHelp:
    "Delay (0 to 120 min) after the scheduled time before declaring an automatic forfeit if a team hasn't shown up. Default: {default} min.",
  checkinAtTitle: 'Check-in at {time}',
  reasonAutoForfeit: 'Auto-forfeit (no check-in)',
  statusPending: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  statusWalkover: 'Walkover',
  statusCancelled: 'Cancelled',
  graceValidation: 'The grace window must be an integer between 0 and 120.',
  errorMigrationMissing: 'Setting unavailable: check-in migration not applied.',
  errorSave: 'Save failed',
  graceUpdated: 'Grace window updated.',
  errorGeneric: 'Failed',
  processResult:
    'Processed: {scanned} matches scanned, {acted} action(s), {errors} error(s)',
};
