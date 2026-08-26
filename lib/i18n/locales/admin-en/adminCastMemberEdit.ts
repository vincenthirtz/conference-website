// lib/i18n/locales/admin-en/adminCastMemberEdit.ts
//
// Traductions ANGLAISES du namespace admin `adminCastMemberEdit`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminCastMemberEdit.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Edit caster',
  back: 'Back to list',
  heading: 'Edit caster',
  loading: 'Loading...',
  previewNameFallback: 'Name',
  previewTitleFallback: 'Title',
  nameLabel: 'Name',
  titleLabel: 'Title / Role',
  cityLabel: 'City / Country',
  sortOrderLabel: 'Display order',
  imageLabel: 'Image URL',
  twitchLabel: 'Twitch or other link',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Short bio (optional)...',
  activeLabel: 'Active (visible on the association page)',
  promoLabel: 'Promo card (e.g. "Want to join the cast?")',
  cancel: 'Cancel',
  saving: 'Saving...',
  submit: 'Save',
  updateSuccess: 'Caster updated successfully.',
  errorLoad: 'Loading error.',
  errorNameRequired: 'Name is required.',
  errorGeneric: 'Unexpected error.',
};
