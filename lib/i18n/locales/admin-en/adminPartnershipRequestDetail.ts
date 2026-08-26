// lib/i18n/locales/admin-en/adminPartnershipRequestDetail.ts
//
// Traductions ANGLAISES du namespace admin `adminPartnershipRequestDetail`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPartnershipRequestDetail.ts`) : toute cle
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
  errorLoad: 'Loading error.',
  toastUpdated: 'Updated successfully.',
  errorGeneric: 'An error occurred.',
  notFound: 'Request not found',
  backToRequests: 'Back to requests',
  pageTitle: 'Admin - {company}',
  receivedOn: 'Request received on {date}',
  contactInfo: 'Contact information',
  contact: 'Contact',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  requestDetails: 'Request details',
  category: 'Category:',
  budget: 'Budget:',
  message: 'Message',
  quickActions: 'Quick actions',
  sendEmail: 'Send an email',
  call: 'Call',
  createPartner: 'Create the partner',
  management: 'Management',
  statusLabel: 'Status',
  adminNotesLabel: 'Internal notes',
  adminNotesPlaceholder: 'Notes visible to staff only...',
  saving: 'Saving...',
  save: 'Save',
  history: 'History',
  historyReceived: 'Request received',
  historyRead: 'Read',
  historyContacted: 'Contacted',
  historyUpdated: 'Last updated',
  techInfo: 'Technical information',
  idLabel: 'ID:',
  ipLabel: 'IP:',
};
