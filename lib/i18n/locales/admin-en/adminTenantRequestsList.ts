// lib/i18n/locales/admin-en/adminTenantRequestsList.ts
//
// Traductions ANGLAISES du namespace admin `adminTenantRequestsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTenantRequestsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  tabAll: 'All',
  tabEmailVerif: 'Email verif.',
  tabBotInvite: 'Bot invite',
  tabCompleted: 'Completed',
  tabRejected: 'Rejected',
  tabExpired: 'Expired',
  badgeEmailVerif: 'Email verif.',
  badgeBotInvite: 'Bot invite',
  badgeCompleted: 'Completed',
  badgeRejected: 'Rejected',
  badgeExpired: 'Expired',
  errorLoad: 'Loading error',
  errorReasonLength: 'The reason must be between 1 and 500 characters.',
  toastRejected: 'Request rejected.',
  errorReject: 'Error while rejecting.',
  toastExpired: 'Request expired.',
  errorExpire: 'Error while expiring.',
  summaryLoading: 'Loading…',
  summaryEmpty: 'No requests for this filter.',
  summaryRange: '{start}–{end} of {total}',
  pageTitle: 'Admin – Tenant requests',
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Tenant requests',
  heading: 'Tenant requests',
  subtitle: 'Self-service request queue (auto-approved flow). ',
  refreshing: 'Refreshing…',
  refresh: 'Refresh',
  colStatus: 'Status',
  colSlug: 'Requested slug',
  colName: 'Name',
  colEmail: 'Email',
  colDiscord: 'Discord',
  colCreated: 'Created on',
  colTenant: 'Tenant created',
  colActions: 'Actions',
  selfBadge: 'You',
  viewTenant: 'View tenant',
  reject: 'Reject',
  expire: 'Expire',
  readOnly: 'Read-only',
  prev: '← Previous',
  next: 'Next →',
  rejectTitle: 'Reject this request',
  rejectConfirm: 'Reject',
  rejecting: 'Rejecting…',
  cancel: 'Cancel',
  rejectReasonLabel: 'Rejection reason (visible in staff logs)',
  rejectReasonPlaceholder: 'Spam, forbidden slug, suspicious email…',
  rejectCounter: '{count}/500 — the reason is required.',
  expireTitle: 'Expire this request',
  expireConfirm: 'Expire',
  expiring: 'Expiring…',
  expireBodyBefore: 'The request will move to status ',
  expireBodyAfter:
    '. The slug will be freed and the user will be able to submit a new request.',
  loadingRequests: 'Loading requests…',
  emptyTitle: 'No requests',
  emptyDescAll: 'No tenant requests in the database.',
  emptyDescFilter: 'No requests with this status.',
};
