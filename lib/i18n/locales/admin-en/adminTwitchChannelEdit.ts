// lib/i18n/locales/admin-en/adminTwitchChannelEdit.ts
//
// Traductions ANGLAISES du namespace admin `adminTwitchChannelEdit`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTwitchChannelEdit.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Edit Twitch channel',
  back: 'Back to list',
  heading: 'Edit channel',
  loading: 'Loading...',
  previewLabelFallback: 'Label',
  channelLabel: 'Twitch channel name',
  labelLabel: 'Display label',
  badgeLabel: 'Badge',
  badgePlaceholder: 'e.g. Cast, Player, Coach...',
  sortOrderLabel: 'Display order',
  avatarLabel: 'Avatar URL',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Describe the channel in a few words...',
  activeLabel: 'Active channel (visible on the homepage)',
  cancel: 'Cancel',
  saving: 'Saving...',
  submit: 'Save',
  updateSuccess: 'Channel updated successfully.',
  errorLoad: 'Loading error.',
  errorRequired: 'The channel name and label are required.',
  errorGeneric: 'Unexpected error.',
};
