// lib/i18n/locales/admin-en/adminPoleMemberEdit.ts
//
// Traductions ANGLAISES du namespace admin `adminPoleMemberEdit`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPoleMemberEdit.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Edit member',
  back: 'Back to list',
  heading: 'Edit member',
  loading: 'Loading...',
  poleLabel: 'Team',
  nameLabel: 'Name',
  titleLabel: 'Title / Role',
  titlePlaceholder: 'e.g. President',
  sortOrderLabel: 'Display order',
  avatarLabel: 'Avatar URL',
  linkLabel: 'Link (Twitch, X, contact...)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Short bio (optional)...',
  activeLabel: 'Active (visible on the association page)',
  cancel: 'Cancel',
  saving: 'Saving...',
  submit: 'Save',
  updateSuccess: 'Member updated successfully.',
  errorLoad: 'Loading error.',
  errorNameRequired: 'Name is required.',
  errorGeneric: 'Unexpected error.',
};
