// lib/i18n/locales/admin-en/adminScrimsCreate.ts
//
// Traductions ANGLAISES du namespace admin `adminScrimsCreate`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminScrimsCreate.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – New scrim',
  heading: 'New scrim',
  nameLabel: 'Name',
  team1Label: 'Team 1',
  team2Label: 'Team 2',
  teamPlaceholder: '— Choose —',
  scheduledLabel: 'Scheduled date',
  statusLabel: 'Status',
  statusDraft: 'Draft',
  statusScheduled: 'Scheduled',
  statusRunning: 'Running',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  gameLabel: 'Game',
  descriptionLabel: 'Description',
  streamUrlLabel: 'Stream URL',
  isPublicLabel: 'Publicly visible',
  submit: 'Create scrim',
  submitting: 'Creating…',
  cancel: 'Cancel',
  errorNameRequired: 'Name is required.',
  errorTeamsDistinct: 'The two teams must be different.',
  errorCreate: 'Creation error.',
};
