// lib/i18n/locales/admin-en/adminPoleMembersNew.ts
//
// Traductions ANGLAISES du namespace admin `adminPoleMembersNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminPoleMembersNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – New team member',
  back: 'Back to list',
  heading: 'Add a team member',
  subtitle: 'Set up a new member for the association page',
  poleLabel: 'Team',
  nameLabel: 'Name',
  titleLabel: 'Title / Role',
  titlePlaceholder: 'e.g. President, Treasurer...',
  sortOrderLabel: 'Display order',
  sortOrderPlaceholder: 'Auto (last)',
  avatarLabel: 'Avatar URL',
  linkLabel: 'Link (Twitch, X, contact...)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Short bio (optional)...',
  activeLabel: 'Active (visible on the association page)',
  cancel: 'Cancel',
  creating: 'Creating...',
  submit: 'Create',
  errorNameRequired: 'Name is required.',
  errorGeneric: 'Unexpected error.',
};
