// lib/i18n/locales/admin-en/adminTournamentStagesList.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentStagesList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentStagesList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin · Tournament stages',
  typeGroup: 'Group',
  typeBracket: 'Bracket',
  typeSwiss: 'Swiss',
  typeRoundRobin: 'Round robin',
  typeShowmatch: 'Showmatch',
  typeOther: 'Other',
  defaultTournamentName: 'Tournament',
  breadcrumbTournaments: 'Tournaments',
  breadcrumbStages: 'Stages',
  eyebrow: 'Admin · Stages',
  titleSuffix: '{name} · Stages',
  viewMatches: 'View matches',
  cancel: 'Cancel',
  reorder: 'Reorder',
  saving: 'Saving…',
  saveOrder: 'Save order',
  addTemplateBlock: '+ Template block',
  refresh: 'Refresh',
  loading: 'Loading…',
  empty: 'No stages for this tournament.',
  moveUp: 'Move up',
  moveDown: 'Move down',
  orderPrefix: 'Order ',
  open: 'Open',
  active: 'Active',
  inactive: 'Inactive',
  public: 'Public',
  private: 'Private',
  startsAt: 'Starts: ',
  endsAt: 'Ends: ',
  modalTitle: 'Add a template block',
  modalSubtitle:
    "The template's stages will be added after the existing stages.",
  applying: 'Applying...',
  addStages: 'Add stages',
  errorLoad: 'Loading error',
  errorSaveOrder: 'Error while saving',
  errorApplyTemplate: "Couldn't apply the template",
  errorApplyTemplateGeneric: 'Error while applying the template',
  toastTemplateAdded: 'Template "{name}" added',
};
