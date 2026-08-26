// lib/i18n/locales/admin-en/adminTenantsList.ts
//
// Traductions ANGLAISES du namespace admin `adminTenantsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTenantsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errorLoad: 'Loading error',
  pageTitle: 'Admin – Tenants',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  heading: 'Tenants',
  loading: 'Loading…',
  countTenants_one: '{count} tenant configured',
  countTenants_other: '{count} tenants configured',
  createTenant: 'Create a tenant',
  pendingText_one: ' Discord server awaiting assignment.',
  pendingText_other: ' Discord servers awaiting assignment.',
  pendingViewQueue: 'View queue →',
  searchPlaceholder: 'Search by slug or name…',
  filterAll: 'All',
  filterActive: 'Active',
  filterArchived: 'Archived',
  emptyTitle: 'No tenant found',
  emptyDescNone: 'No tenant configured yet.',
  emptyDescFilter: 'No results for this filter / search.',
  colSlug: 'Slug',
  colName: 'Name',
  colStatus: 'Status',
  colPlan: 'Plan',
  colGuilds: 'Guilds',
  colStaff: 'Staff',
  colCreated: 'Created on',
  colActions: 'Actions',
  statusActive: 'Active',
  statusArchived: 'Archived',
  planStatusActive: 'Active',
  planStatusPastDue: 'Past due',
  planStatusCanceled: 'Canceled',
  planExpires: 'Expires on {date}',
  generateLink: 'Payment link',
  generateLinkOwnerOnly: 'Owner role only',
  edit: 'Edit',
  loadingTenants: 'Loading tenants…',
};
