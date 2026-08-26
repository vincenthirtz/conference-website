// lib/i18n/locales/admin-en/adminStageSwiss.ts
//
// Traductions ANGLAISES du namespace admin `adminStageSwiss`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStageSwiss.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusPending: 'Upcoming',
  statusOngoing: 'In progress',
  statusFinished: 'Finished',
  statusCancelled: 'Cancelled',
  errUnexpected: 'Unexpected error',
  errPreview: 'Error while previewing Swiss pairings',
  errPreviewShort: 'Error during preview',
  confirmRematchTitle: 'This pairing contains rematches',
  confirmRematchSubtitle:
    "Two teams will play each other again (the solver couldn't find better). Confirm generation?",
  confirmRematchLabel: 'Generate anyway',
  errGenerate: 'Error while generating the Swiss round',
  toastGenerated: 'Swiss round #{round} generated: {count} matches created.',
  errGenerateShort: 'Error while generating the round',
  pageTitle: 'Admin – Swiss stage',
  back: '← Back to stage',
  heading: 'Swiss Management',
  phaseLabel: 'Stage:',
  tournamentLabel: '• Tournament',
  currentRound: 'Current round: {round}',
  refreshData: 'Refresh data',
  previewCalculating: 'Calculating…',
  previewNextRound: 'Preview next round',
  exportCsv: 'Export CSV',
  toolbarHelp:
    'Generation uses the Swiss pairing system (wins, Buchholz, etc.) and avoids rematches as much as possible.',
  previewTitle: 'Preview — Round #{round}',
  previewMatchCount_one: '{count} match proposed',
  previewMatchCount_other: '{count} matches proposed',
  previewHasRematches: '(contains rematches)',
  generating: 'Generating…',
  confirmGenerate: 'Confirm and generate',
  cancel: 'Cancel',
  vs: 'vs',
  loadingData: 'Loading Swiss data…',
  stageNotFound: 'Stage not found.',
  standingsTitle: 'Swiss standings',
  teamCount_one: '{count} team',
  teamCount_other: '{count} teams',
  emptyStandings:
    'No standings available. Make sure teams are attached to the stage and that rounds have been played.',
  thTeam: 'Team',
  thWins: 'W',
  thLosses: 'L',
  thDraws: 'D',
  thPoints: 'Pts',
  thMaps: 'Maps +/−',
  thBuchholz: 'Buchholz',
  thOppWinrate: 'Opp. winrate',
  roundsTitle: 'Swiss rounds & matches',
  roundCount_one: '{count} round',
  roundCount_other: '{count} rounds',
  emptyRounds:
    'No round has been generated yet. Use the "Generate next Swiss round" button to create round #1.',
  roundTitle: 'Swiss round #{round}',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matches',
  scorePrefix: 'Score:',
  openAdmin: 'Open (admin)',
  publicLink: 'Public',
};
