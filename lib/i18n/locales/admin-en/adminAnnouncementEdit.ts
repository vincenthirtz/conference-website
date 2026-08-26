// lib/i18n/locales/admin-en/adminAnnouncementEdit.ts
//
// Traductions ANGLAISES du namespace admin `adminAnnouncementEdit`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminAnnouncementEdit.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Edit announcement',
  pageTitleLoading: 'Admin – Loading...',
  pageTitleNotFound: 'Admin – Announcement not found',
  notFoundTitle: 'Announcement not found',
  notFoundText: "This announcement doesn't exist or has been deleted.",
  backToList: 'Back to list',
  breadcrumbAnnouncements: 'Announcements',
  breadcrumbEdit: 'Edit',
  back: 'Back to announcements',
  heading: 'Edit announcement',
  subtitle: "Edit this announcement's details.",
  delete: 'Delete',
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
  cancel: 'Cancel',
  saving: 'Saving...',
  submit: 'Save changes',
  deleteConfirm: 'Delete this announcement? This action is irreversible.',
  updateSuccess: 'Announcement updated successfully.',
  errorLoad: 'Error while loading.',
  errorUnknown: 'Unknown error.',
  errorTitleRequired: 'The announcement title is required.',
  errorMessageRequired: 'The announcement message is required.',
  errorUpdate: 'Error while updating the announcement',
  errorUpdateUnknown: 'Unknown error while updating the announcement',
  errorDelete: 'Error while deleting.',
};
