// lib/i18n/locales/admin-en/adminCastMembersList.ts
//
// Traductions ANGLAISES du namespace admin `adminCastMembersList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminCastMembersList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Casters',
  heading: 'Production & Cast team',
  count_one: '{count} caster configured',
  count_other: '{count} casters configured',
  loading: 'Loading…',
  addButton: 'Add a caster',
  searchLabel: 'Search',
  searchPlaceholder: 'Name, title or city...',
  statusLabel: 'Status',
  statusAll: 'All',
  statusActivePlural: 'Active',
  statusInactivePlural: 'Inactive',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  emptyFiltered: 'No casters found',
  emptyState: 'No casters configured',
  savingOrder: 'Saving order…',
  promo: 'Promo',
  order: 'Order',
  deactivate: 'Deactivate',
  activate: 'Activate',
  edit: 'Edit',
  delete: 'Delete',
  previous: 'Previous',
  next: 'Next',
  paginationOf: ' of {total}',
  deleteConfirmTitle: 'Delete this caster?',
  reorderFailed_one: '{failed} of {total} update failed',
  reorderFailed_other: '{failed} of {total} updates failed',
  errorReorder: 'Error while saving the order.',
  errorDeleteFailed: 'Unable to delete',
  errorDelete: 'Delete error.',
  errorUpdateFailed: 'Unable to update',
  errorUpdate: 'Update error.',
};
