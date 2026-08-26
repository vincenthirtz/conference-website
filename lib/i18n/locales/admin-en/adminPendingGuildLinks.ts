// lib/i18n/locales/admin-en/adminPendingGuildLinks.ts
//
// Traductions ANGLAISES du namespace admin `adminPendingGuildLinks`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPendingGuildLinks.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorLoad: 'Loading error',
  errorSelectTenant: 'Select a tenant.',
  errorSlugNameRequired: 'Slug and name required.',
  errorSlugInvalid: 'Invalid slug (kebab-case).',
  toastAssigned: 'Server assigned.',
  errorAssign: 'Assignment failed.',
  confirmRejectTitle: 'Reject {name}?',
  confirmRejectSubtitle:
    'The request will be removed from the queue. The bot will be ignored until it requests again.',
  reject: 'Reject',
  toastRejected: 'Request rejected.',
  errorReject: 'Rejection failed.',
  pageTitle: 'Admin – Pending Discord servers',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  breadcrumbCurrent: 'Discord server queue',
  heading: 'Pending Discord servers',
  subtitle:
    'When the bot joins a server with no assigned tenant, the server waits here for a staff member to assign it to an existing tenant or create a new one.',
  loading: 'Loading queue…',
  emptyTitle: 'No pending servers.',
  emptyDesc:
    "You'll be notified here as soon as a Discord server needs to be assigned.",
  colGuild: 'Guild',
  colOwner: 'Owner Discord ID',
  colRequested: 'Requested on',
  colActions: 'Actions',
  noName: '— no name —',
  assign: 'Assign…',
  modalTitle: 'Assign {name}',
  modalSubtitle: 'Choose an existing tenant or create a new one.',
  cancel: 'Cancel',
  assigning: 'Assigning…',
  assignBtn: 'Assign',
  modeExisting: 'Existing tenant',
  modeNew: 'New tenant',
  tenantLabel: 'Tenant',
  selectPlaceholder: '— select —',
  archivedSuffix: ' (archived)',
  slugLabel: 'Slug (kebab-case)',
  slugPlaceholder: 'my-event',
  nameLabel: 'Name',
  namePlaceholder: 'My event',
};
