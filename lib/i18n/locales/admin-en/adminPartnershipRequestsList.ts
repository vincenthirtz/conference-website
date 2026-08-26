// lib/i18n/locales/admin-en/adminPartnershipRequestsList.ts
//
// Traductions ANGLAISES du namespace admin `adminPartnershipRequestsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPartnershipRequestsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusNew: 'New',
  statusRead: 'Read',
  statusContacted: 'Contacted',
  statusNegotiating: 'Negotiating',
  statusAccepted: 'Accepted',
  statusDeclined: 'Declined',
  statusArchived: 'Archived',
  categorySuper: 'Super partner',
  categoryMajor: 'Major partner',
  categoryCultural: 'Cultural partner',
  categoryOther: 'Other',
  confirmDeleteTitle: 'Delete this request?',
  delete: 'Delete',
  errorDelete: 'Deletion error.',
  pageTitle: 'Admin - Partnership requests',
  heading: 'Partnership requests',
  countRequests_one: '{count} request',
  countRequests_other: '{count} requests',
  newCount_one: '{count} new',
  newCount_other: '{count} new',
  managePartners: 'Manage partners',
  filterStatus: 'Status',
  statusAll: 'All statuses',
  filterCategory: 'Category',
  categoryAll: 'All categories',
  filterSearch: 'Search',
  searchPlaceholder: 'Company, contact, email...',
  empty: 'No requests found',
  receivedOn: 'Received on {date}',
  budget: 'Budget: {budget}',
  view: 'View',
  previous: 'Previous',
  next: 'Next',
  paginationTotal: ' of {total}',
};
