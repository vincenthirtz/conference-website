// lib/i18n/locales/admin-en/adminScrimDetail.ts
//
// Traductions ANGLAISES du namespace admin `adminScrimDetail`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminScrimDetail.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorLoad: 'Loading error.',
  errorSave: 'Save error.',
  errorCreateMatch: 'Error creating the match.',
  errorDelete: 'Delete error.',
  confirmDelete: 'Delete this scrim and its matches?',
  loading: 'Loading…',
  headTitle: '{name} – Scrim admin',
  backAll: '← All scrims',
  slug: 'Slug: {slug}',
  delete: 'Delete',
  infoHeading: 'Information',
  nameLabel: 'Name',
  team1Label: 'Team 1',
  team2Label: 'Team 2',
  teamNone: '— None —',
  teamExternalOption: '+ External team…',
  teamExternalPlaceholder: 'External team name',
  teamExternalHint: "Created on save, with no roster and the Women's Cup logo.",
  errorExternalNameRequired: 'Enter the external team name.',
  scheduledLabel: 'Scheduled date',
  noDateHint: 'No date yet?',
  openPlanning: 'Open an availability grid',
  statusLabel: 'Status',
  statusDraft: 'Draft',
  statusScheduled: 'Scheduled',
  statusRunning: 'Running',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  streamUrlLabel: 'Stream URL',
  descriptionLabel: 'Description',
  isPublicLabel: 'Publicly visible',
  save: 'Save',
  saving: 'Saving…',
  matchesHeading: 'Matches ({count})',
  addMatch: '+ Add a match',
  matchesEmpty: 'No matches. Add a first match for this scrim day.',
  matchTeamsVs: '{team1} vs {team2}',
  defaultTeam1: 'Team 1',
  defaultTeam2: 'Team 2',
  edit: 'Edit →',
  statusDisputed: 'Disputed',
  resultHeading: 'Result',
  resultCurrent: '{team1} {score1} – {score2} {team2}',
  resultNone: 'No result recorded yet.',
  resultWinner: 'Winner: {team}',
  resultDraw: 'Draw',
  resultDisputeNotice: 'Dispute in progress: {reason}',
  resultDisputeNoReason: 'no reason given',
  resultCompletedNotice:
    'This scrim is already completed: saving a new score corrects the existing result.',
  resultCancelledNotice:
    'Cancelled scrim: reinstate it (status) before entering a result.',
  resultTeamsMissing: 'Assign both teams before entering a result.',
  resultScoreFor: 'Score — {team}',
  resultSubmit: 'Save result',
  resultSubmitting: 'Saving…',
  resultConfirmTitle: 'Record the result {score}?',
  resultConfirmSubtitle:
    'The scrim will be marked completed. Pending captain reports will be deleted.',
  resultConfirmOverrideTitle: "Correct this scrim's result?",
  resultConfirmOverrideSubtitle:
    'Current score {previous} → new score {next}. Rewards already granted are neither taken back nor granted again.',
  resultConfirmDisputeSubtitle:
    "This score settles the dispute ({reason}). Both captains' reports will be deleted.",
  resultConfirmLabel: 'Save',
  resultSaved: 'Result saved.',
  resultLiveSubmit: 'Update live score',
  resultLiveSaved: 'Live score updated.',
  resultLiveHint:
    'During the match: “Update live score” shows the score on the overlay without ending the scrim (a scheduled scrim becomes “running”). “Save result” ends it.',
  resultRebuildHint:
    "The winner changed: the player ranking isn't recalculated automatically.",
  resultRebuildLink: 'Rebuild the ranking',
  resultErrorChanged:
    'The scrim changed in the meantime: it has been reloaded, check before saving again.',
  resultError: 'Error saving the result.',
};
