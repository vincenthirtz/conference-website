// lib/i18n/locales/admin-en/adminDocuments.ts
//
// Traductions ANGLAISES du namespace admin `adminDocuments`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDocuments.ts`) : toute
// cle ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans
// quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin · Association documents',
  eyebrow: 'Admin · Association',
  heading: 'Association documents',
  intro:
    'The association’s Drive, read-only. Files stay with Google: this page tells you what is in there, and opens the document in Drive.',

  loadError: 'The list could not be loaded.',
  retry: 'Retry',
  empty: 'This folder is empty.',
  count: '{count} item(s)',
  searchPlaceholder: 'Search for a document…',

  breadcrumbAria: 'Drive breadcrumb',
  openInDrive: 'Open in Drive',

  colName: 'Name',
  colType: 'Type',
  colSize: 'Size',
  colModified: 'Modified',
  colModifiedBy: 'By',
  colActions: '',

  typeFolder: 'Folder',
  typePdf: 'PDF',
  typeDoc: 'Document',
  typeSheet: 'Spreadsheet',
  typeSlides: 'Presentation',
  typeImage: 'Image',
  typeOther: 'File',
  sizeUnknown: '—',
  modifiedByUnknown: '—',

  setupTitle: 'The Drive is not connected yet',
  setupIntro:
    'Two environment variables are enough. Nothing to install, nothing to migrate.',
  setupStep1:
    '1. Create a Google Cloud service account and download its JSON key.',
  setupStep2:
    '2. Share the association’s Drive folder with the service account address (Viewer access is enough).',
  setupStep3:
    '3. Set GOOGLE_DRIVE_SA_KEY (the JSON key, raw or base64) and GOOGLE_DRIVE_FOLDER_ID (the folder id, visible in its URL).',
  setupWhy:
    'Why a service account rather than a personal Google sign-in: a personal grant disappears with the person who gave it. A service account belongs to the association.',

  // Upload / trash — only shown with the write permission
  uploadCta: 'Upload a file',
  uploading: 'Uploading…',
  uploaded: '“{name}” uploaded.',
  uploadError: 'The upload failed.',
  uploadTypeError: 'This file type is not accepted.',
  uploadSizeError: 'File too large (25 MB maximum).',
  uploadHint:
    'PDF, images, office documents. 25 MB maximum. The file goes straight to the Drive.',
  readOnlyNote:
    'You are viewing the Drive read-only. Uploading requires the “Upload documents” permission.',
  trash: 'Trash',
  trashing: 'Sending…',
  trashed: '“{name}” is in the Drive trash.',
  trashError: 'Moving to trash failed.',
  confirmTrashTitle: 'Move to trash?',
  confirmTrashBody:
    '“{name}” goes to the Drive trash, where it stays recoverable for 30 days. Nothing is permanently deleted.',
  confirmTrashCta: 'Move to trash',
  cancel: 'Cancel',
};
