// lib/i18n/locales/admin-en/adminLeaguesList.ts
//
// Traductions ANGLAISES du namespace admin `adminLeaguesList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminLeaguesList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusDraft: 'Draft',
  statusActive: 'Active',
  statusFinished: 'Finished',
  statusArchived: 'Archived',
  errNameRequired: 'Name is required.',
  errSlugFormat:
    'The slug must contain only lowercase letters, digits and hyphens.',
  errPointsShape: 'The scoring table must be a JSON object { rank: points }.',
  toastCreated: 'League created.',
  errSlugConflict: 'This slug is already used by another league.',
  errCreate: 'Error while creating.',
  formTitle: 'New league',
  nameLabel: 'Name *',
  namePlaceholder: 'Summer Season 2026',
  slugLabel: 'Slug *',
  slugPlaceholder: 'summer-season-2026',
  descriptionLabel: 'Description',
  gameLabel: 'Game',
  gamePlaceholder: 'Overwatch 2',
  startDateLabel: 'Start date',
  endDateLabel: 'End date',
  pointsLabel: 'Scoring table (JSON rank → points)',
  pointsHelp: 'Leave as is for the default scoring.',
  publicLabel: 'Public league (visible on the site)',
  creating: 'Creating…',
  submit: 'Create league',
  cancel: 'Cancel',
  pageTitle: 'Admin – Leagues',
  breadcrumbAdmin: 'Admin',
  breadcrumbLeagues: 'Leagues',
  heading: 'Leagues & seasons',
  loading: 'Loading…',
  leagueCount_one: '{count} league',
  leagueCount_other: '{count} leagues',
  ratingsLink: 'Ratings',
  newLeague: 'New league',
  errLoad: 'Error while loading.',
  retry: 'Retry',
  emptyTitle: 'No league',
  emptyDescription:
    'Create a first league/season to aggregate standings across several tournaments.',
  publicBadge: 'Public',
  edit: 'Edit',
  delete: 'Delete',
  deleteConfirmTitle: 'Delete “{name}”?',
  deleteConfirmSubtitle:
    'The league and its standings will be deleted. This action is irreversible.',
  deleteConfirmLabel: 'Delete',
  errDeleteStatus: 'Deletion failed ({status})',
  toastDeleted: 'League deleted.',
  errDelete: 'Error while deleting.',
};
