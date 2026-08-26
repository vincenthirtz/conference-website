// lib/i18n/locales/admin-en/adminTournamentBracketBuilder.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentBracketBuilder`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentBracketBuilder.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitleWith: '{name} — Schedule',
  pageTitle: 'Tournament schedule',
  back: 'Back to tournament',
  heading: 'Match schedule',
  statMatches: 'matches',
  statDays: 'days',
  statFinished: 'finished',
  viewPlanning: 'Schedule',
  viewList: 'List',
  viewBracket: 'Tree',
  loading: 'Loading...',
  reload: 'Reload',
  saving: 'Saving...',
  save: 'Save',
  saved: 'Saved',
  unsavedChanges: 'Unsaved changes',
  exportPdf: 'Export PDF',
  emptyMatches: 'No matches found for this tournament.',
  createBracket: 'Create a bracket',
  dayMatchCount_one: '{count} match',
  dayMatchCount_other: '{count} matches',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  roundFinal: 'Final',
  roundLabel: 'Round {n}',
  lbRoundLabel: 'LB Round {n}',
  noDate: 'No date',
  seedLabel: 'Seed {n}',
  tbd: 'TBD',
  defaultTournamentName: 'Tournament',
  pdfTitle: '{name} — Match schedule',
  pdfSubtitle: 'Exported on {date} · {matches} matches · {days} days',
  pdfBracketView: 'Bracket view',
  pdfMatchList: 'Match list',
  pdfColTime: 'Time',
  pdfColTeam1: 'Team 1',
  pdfColTeam2: 'Team 2',
  pdfColFormat: 'Format',
  pdfColStatus: 'Status',
  pdfFooter: '{matches} matches · {finished} finished',
  errorLoad: "Couldn't load the matches",
  errorSave: 'Error while saving',
  errorUnexpected: 'Unexpected error',
  errorUnknown: 'Unknown error',
  toastSaved: 'Schedule saved.',
};
