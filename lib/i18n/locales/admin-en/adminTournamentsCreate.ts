// lib/i18n/locales/admin-en/adminTournamentsCreate.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentsCreate`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentsCreate.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin – Create a tournament',
  backToList: 'Back to tournament list',
  pageTitle: 'New tournament',
  pageSubtitle:
    'Set up the basics; you can fine-tune stages / matches afterwards.',
  templateTitle: 'Structure template',
  templateHelp:
    "Choose a template to automatically create the tournament's stages, or leave blank to configure them manually.",
  noTemplate: 'No template',
  noTemplateDesc: 'Configure stages manually after creation.',
  generalInfo: 'General information',
  nameLabel: 'Tournament name',
  slugLabel: 'Slug (URL)',
  slugHelp: 'Leave blank to generate automatically.',
  gameLabel: 'Game',
  statusLabel: 'Status',
  statusDraft: 'Draft',
  statusPublished: 'Published',
  statusRunning: 'Running',
  statusCompleted: 'Completed',
  statusArchived: 'Archived',
  planningFormat: 'Schedule & format',
  startDateLabel: 'Start date',
  endDateLabel: 'End date',
  globalFormatLabel: 'Global format',
  formatTbd: '(To be defined later)',
  formatSingleElim: 'Single Elim',
  formatDoubleElim: 'Double Elim',
  formatSwiss: 'Swiss',
  formatRoundRobin: 'Round Robin',
  formatShowmatch: 'Showmatch',
  maxTeamsLabel: 'Max. number of teams',
  minPlayersLabel: 'Min. players per team',
  maxPlayersLabel: 'Max. players per team',
  visibilityVisuals: 'Visibility & visuals',
  makePublic: 'Make the tournament public on the site',
  makeFeatured: 'Highlight ("featured" section)',
  logoUrlLabel: 'Logo (URL)',
  bannerUrlLabel: 'Banner (URL)',
  creating: 'Creating...',
  createButton: 'Create tournament',
  cancel: 'Cancel',
  preview: 'Preview',
  logoAlt: 'Logo',
  nameFallback: 'Tournament name',
  badgePublic: 'Public',
  badgeFeatured: 'Featured',
  templateSelected: 'Selected template',
  templateStagesNote:
    'Stages will be created automatically after the tournament is created.',
  infoTitle: 'Information',
  infoDraftDefault: 'The tournament will be created in draft mode by default.',
  infoConfigureLater: 'You can configure stages and matches after creation.',
  infoSlugUsage: "The slug is used for the tournament's public URL.",
  errorNameRequired: 'The tournament name is required.',
  errorEndAfterStart: 'The end date must be after the start date.',
  errorCreate: 'Error creating the tournament',
  errorCreateUnknown: 'Unknown error creating the tournament',
  errorTemplatesLoad: 'Could not load custom templates.',
};
