// lib/i18n/locales/admin-en/adminEventsList.ts
//
// Traductions ANGLAISES du namespace admin `adminEventsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminEventsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Run of show',
  breadcrumbAdmin: 'Admin',
  breadcrumbRunOfShow: 'Run of show',
  heading: 'Run of show',
  subtitle: 'Plan the flow of an evening: segments, matches, breaks, intros.',
  newEvent: '+ New event',
  tabAll: 'All',
  tabDraft: 'Drafts',
  tabLive: 'Live',
  tabDone: 'Done',
  errorLoad: 'Loading error.',
  loading: 'Loading…',
  emptyTitle: 'No events for this filter.',
  emptyDescription:
    'Create your first run-of-show to plan the segments of an evening.',
  emptyAction: 'New event',
  colName: 'Name',
  colSlug: 'Slug',
  colScheduled: 'Scheduled date',
  colStatus: 'Status',
  colActions: 'Actions',
  openDirector: 'Open the Director',
  delete: 'Delete',
  confirmDeleteTitle: 'Delete « {name} »?',
  confirmDeleteSubtitle:
    'This action will permanently delete the run and all its segments. Irreversible.',
  confirmDeleteLabel: 'Delete',
  deleteFailedStatus: 'Delete failed ({status}).',
  eventDeleted: 'Event deleted.',
  deleteFailed: 'Delete failed.',
  eventCreatedToast: 'Event « {name} » created.',
  modalTitle: 'New event',
  modalSubtitle: 'An event_run in draft mode. You can add segments afterwards.',
  nameLabel: 'Name',
  namePlaceholder: 'May 21 conference',
  slugLabel: 'Slug',
  slugHint:
    'Auto-generated from the name. Editable if you want to customize it.',
  scheduledLabel: 'Scheduled date',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Optional note visible to staff only.',
  nameRequired: 'Name is required.',
  scheduledRequired: 'The scheduled date is required.',
  createFailed: 'Creation failed.',
  cancel: 'Cancel',
  submit: 'Create',
  submitting: 'Creating…',
};
