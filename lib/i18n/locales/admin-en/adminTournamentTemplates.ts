// lib/i18n/locales/admin-en/adminTournamentTemplates.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentTemplates`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentTemplates.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  stageTypeGroup: 'Group',
  stageTypeBracket: 'Bracket',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round Robin',
  stageTypeShowmatch: 'Showmatch',
  stageTypeOther: 'Other',
  errorUnexpected: 'Unexpected error',
  errorNameRequired: 'Name is required.',
  errorStageRequired: 'At least one named stage is required.',
  createSuccess: 'Template created successfully.',
  deleteConfirmTitle: 'Delete this custom template?',
  deleteConfirmLabel: 'Delete',
  deleteSuccess: 'Template deleted.',
  badgeBuiltIn: 'Built-in',
  badgeCustom: 'Custom',
  deleteTitle: 'Delete',
  cardId: 'ID: {id}',
  pageTitle: 'Admin – Tournament templates',
  back: 'Back to tournaments',
  heading: 'Tournament templates',
  subtitle:
    'Manage built-in and custom templates to quickly create tournament structures.',
  newTemplate: 'New template',
  createHeading: 'Create a custom template',
  nameLabel: 'Name',
  namePlaceholder: 'My custom template',
  descLabel: 'Description',
  descPlaceholder: 'Template description...',
  stagesLabel: 'Stages',
  addStage: '+ Add a stage',
  stageNamePlaceholder: 'Stage name',
  creating: 'Creating...',
  createSubmit: 'Create template',
  cancel: 'Cancel',
  builtInHeading: 'Built-in templates ({count})',
  customHeading: 'Custom templates ({count})',
  emptyCustom: 'No custom templates.',
  emptyCustomHint: 'Click "New template" to create one.',
};
