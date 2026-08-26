// lib/i18n/locales/admin-en/adminStagesCreate.ts
//
// Traductions ANGLAISES du namespace admin `adminStagesCreate`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminStagesCreate.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errLoadTournaments: 'Unexpected error while loading tournaments',
  errSettingsInvalid: 'The configuration JSON (settings) is invalid.',
  errSelectTournament: 'Please select a tournament.',
  errNameRequired: 'The stage name is required.',
  errDateOrder: 'The end date must be after the start date.',
  errSettingsGeneric: 'Error in the configuration JSON.',
  toastCreated: 'Stage created successfully.',
  errCreate: 'Unknown error while creating the stage',
  pageTitle: 'Admin – Create a stage',
  back: '← Back',
  heading: 'New stage',
  subtitle: 'Attach this stage to a tournament, then configure its settings.',
  parentTournamentTitle: 'Parent tournament',
  tournamentLabel: 'Tournament',
  loadingTournaments: 'Loading tournaments…',
  selectTournament: 'Select a tournament',
  tournamentHelp:
    'The stage will be attached to this tournament and visible in its admin dashboard.',
  generalInfoTitle: 'General information',
  nameLabel: 'Stage name',
  namePlaceholder: 'Playoffs, Group A, Swiss #1…',
  slugLabel: 'Slug (internal URL)',
  slugPlaceholder: 'playoffs, swiss-1…',
  slugHelp: 'Leave empty to let the backend handle it.',
  stageTypeLabel: 'Stage type',
  stageTypeNone: '(Undefined / custom)',
  stageTypeGroup: 'Groups',
  stageTypeBracket: 'Bracket (elim)',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round Robin',
  stageTypeShowmatch: 'Showmatch',
  stageTypeOther: 'Other',
  orderLabel: 'Order within the tournament',
  orderPlaceholder: '1, 2, 3…',
  orderHelp: 'Used to sort stages (1 = first, 2 = second, etc.).',
  visibilityTitle: 'Visibility & schedule',
  activeLabel: 'Active stage (counted in the tournament)',
  publicLabel: 'Publicly visible (tournament page)',
  startLabel: 'Stage start',
  endLabel: 'Stage end',
  settingsTitle: 'Advanced configuration (settings JSON)',
  settingsHelp:
    'Used to store stage-specific configuration (Swiss options, number of maps, seedings, etc.). You can leave the JSON empty or minimal and complete it later.',
  cancel: 'Cancel',
  creating: 'Creating…',
  submit: 'Create stage',
};
