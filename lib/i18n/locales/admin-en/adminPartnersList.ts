// lib/i18n/locales/admin-en/adminPartnersList.ts
//
// Traductions ANGLAISES du namespace admin `adminPartnersList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPartnersList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin - Partners',
  heading: 'Partner management',
  count_one: '{count} partner',
  count_other: '{count} partners',
  loading: 'Loading...',
  newButton: 'New partner',
  categoryLabel: 'Category',
  categoryAll: 'All categories',
  categorySuper: 'Super partner',
  categoryMajor: 'Major partner',
  categoryCultural: 'Cultural partner',
  statusLabel: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  searchLabel: 'Search',
  searchPlaceholder: 'Partner name...',
  emptyState: 'No partners found',
  order: 'Order: {order}',
  website: 'Website',
  deactivate: 'Deactivate',
  activate: 'Activate',
  edit: 'Edit',
  delete: 'Delete',
  previous: 'Previous',
  next: 'Next',
  paginationOf: ' of {total}',
  deleteConfirmTitle: 'Delete this partner?',
  errorLoad: 'Unable to load partners.',
  errorDelete: 'Delete error.',
  errorUpdate: 'Update error.',
};
