// lib/i18n/locales/admin-en/adminAnnouncementsNew.ts
//
// Traductions ANGLAISES du namespace admin `adminAnnouncementsNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminAnnouncementsNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – New announcement',
  back: 'Back to announcements list',
  heading: 'New announcement',
  subtitle: 'Create a promo banner or an announcement for the homepage.',
  sectionGeneral: 'General information',
  titleLabel: 'Title',
  titlePlaceholder: 'Special partner offer',
  activate: 'Activate announcement',
  messageLabel: 'Message',
  messagePlaceholder: 'Discover our partner with -20% off your first order...',
  sectionCta: 'Call to Action (optional)',
  ctaLabelLabel: 'Button label',
  ctaLabelPlaceholder: 'Discover, See the offer...',
  ctaUrlLabel: 'Button URL',
  sectionSchedule: 'Scheduling',
  startDateLabel: 'Start date',
  startDateHint: 'Leave empty to display immediately.',
  endDateLabel: 'End date',
  endDateHint: 'Leave empty for an indefinite duration.',
  priorityLabel: 'Priority',
  priorityHint:
    "The higher the number, the higher the announcement's priority.",
  creating: 'Creating...',
  submit: 'Create announcement',
  cancel: 'Cancel',
  sectionPreview: 'Preview',
  previewTitleFallback: 'Announcement title',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  priority: 'Priority {priority}',
  sectionInfo: 'Information',
  infoBanner: 'The announcement will be shown as a banner on the homepage.',
  infoSchedule: 'Dates let you schedule the display automatically.',
  infoPriority:
    'A high priority shows the announcement first if several are active.',
  errorTitleRequired: 'The announcement title is required.',
  errorMessageRequired: 'The announcement message is required.',
  errorCreate: 'Error while creating the announcement',
  errorCreateUnknown: 'Unknown error while creating the announcement',
};
