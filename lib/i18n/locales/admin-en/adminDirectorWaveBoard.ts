// lib/i18n/locales/admin-en/adminDirectorWaveBoard.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorWaveBoard`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorWaveBoard.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  titleRequired: 'The title is required.',
  durationPositive: 'The duration must be a positive integer.',
  subtitle: 'Groupings of segments (groups, final…).',
  cancel: 'Cancel',
  addWave: '+ Wave',
  titlePlaceholder: 'Wave title',
  startLabel: 'Planned start',
  durationLabel: 'Duration (min)',
  durationPlaceholder: 'e.g. 90',
  createWave: 'Create wave',
  empty: 'No waves. Create one to group segments.',
  upAria: 'Move up',
  downAria: 'Move down',
  segCountTitle: 'Attached segments',
  segment_one: '{count} segment',
  segment_other: '{count} segments',
  start: 'Start',
  skip: 'Skip',
  end: 'End',
  close: 'Close',
  edit: 'Edit',
  delete: 'Delete',
  editTitlePlaceholder: 'Title',
  editDurationPlaceholder: 'Duration (min)',
  save: 'Save',
};
