// lib/i18n/locales/admin-en/adminCastMembersNew.ts
//
// Traductions ANGLAISES du namespace admin `adminCastMembersNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminCastMembersNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – New caster',
  back: 'Back to list',
  heading: 'Add a caster',
  subtitle: 'Set up a new caster for the association page',
  nameLabel: 'Name',
  titleLabel: 'Title / Role',
  cityLabel: 'City / Country',
  sortOrderLabel: 'Display order',
  sortOrderPlaceholder: 'Auto (last)',
  imageLabel: 'Image URL',
  imageHint: 'Profile photo (square image recommended)',
  twitchLabel: 'Twitch or other link',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Short bio (optional)...',
  activeLabel: 'Active (visible on the association page)',
  promoLabel: 'Promo card (e.g. "Want to join the cast?")',
  cancel: 'Cancel',
  creating: 'Creating...',
  submit: 'Create',
  errorNameRequired: 'Name is required.',
  errorGeneric: 'Unexpected error.',
};
