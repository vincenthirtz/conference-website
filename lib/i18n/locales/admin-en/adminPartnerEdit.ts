// lib/i18n/locales/admin-en/adminPartnerEdit.ts
//
// Traductions ANGLAISES du namespace admin `adminPartnerEdit`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPartnerEdit.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin - Edit {name}',
  back: 'Back to partners',
  heading: 'Edit partner',
  nameLabel: 'Partner name *',
  namePlaceholder: 'Company name',
  categoryLabel: 'Category *',
  categoryPlaceholder: 'Select a category',
  categorySuper: 'Super partner',
  categoryMajor: 'Major partner',
  categoryCultural: 'Cultural partner',
  descriptionLabel: 'Description *',
  descriptionPlaceholder: 'Partner description...',
  logoUrlLabel: 'Logo URL',
  logoPreviewAlt: 'Logo preview',
  websiteLabel: 'Website',
  noteLabel: 'Badge / Note',
  notePlaceholder: 'e.g. New, 2026',
  displayOrderLabel: 'Display order',
  displayOrderHint: 'The lower the number, the earlier the partner appears.',
  activeLabel: 'Active partner (visible on the site)',
  saving: 'Saving...',
  submit: 'Save changes',
  backButton: 'Back',
  updateSuccess: 'Partner updated successfully.',
  errorLoad: 'Loading error.',
  errorNameRequired: 'Name is required.',
  errorDescriptionRequired: 'Description is required.',
  errorCategoryRequired: 'Category is required.',
  errorGeneric: 'An error occurred.',
};
