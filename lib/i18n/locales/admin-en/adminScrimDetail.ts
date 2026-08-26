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
  scheduledLabel: 'Scheduled date',
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
};
